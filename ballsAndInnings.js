const debug = require('debug')('parser:ballsAndInnings');
const api = require('./api');

processInning = async function(inning, match, inningNumber) {
    debug('Processing inning #%i for match %i', inningNumber, match.id);
    
    let events = [];
    const inningsEvents = inning[Object.keys(inning)[0]].deliveries;
    const battingTeam = match.homeTeam.name == inning[Object.keys(inning)[0]].team ? match.homeTeam : match.awayTeam;
    const fieldingTeam = match.homeTeam == battingTeam ? match.awayTeam : match.homeTeam;

    let previousOver = 0;
    let nextBall = 1;

    debug('Processing %i deliveries in inning %i', inningsEvents.length, inningNumber);
    for(let [index, event] of inningsEvents.entries()) {
        const overAndDelivery = Object.keys(event)[0];
        const over = overAndDelivery.split('.')[0];
        const delivery = overAndDelivery.split('.')[1]; // Total deliveries in this over including illegal ones

        event = event[Object.keys(event)[0]];
        const nextEvent = inningsEvents[index +1] ? inningsEvents[index +1][Object.keys(inningsEvents[index +1])[0]] : null;

        const ballInfo = { 
            battingTeam: battingTeam.id, 
            fieldingTeam: fieldingTeam.id, 
            inningNumber, 
            over,
            delivery
        };
        if(over != previousOver) nextBall = 1; // New over so reset legal delivery to 1

        let processedEvent = await processDelivery(event, match, ballInfo, nextEvent);
        events.push({ ...processedEvent, ball: { ...processedEvent.ball, ball: nextBall } });

        previousOver = processedEvent.ball.over;
        if(processedEvent.eventType != 'noBall' &&
            processedEvent.eventType != 'wide' &&
            processedEvent.eventType != 'timedOut' &&
            processedEvent.eventType != 'penaltyRuns' &&
            processedEvent.eventType != 'retired') nextBall ++; // Increment legal delivery if not extra
    };

    return events;
}

processDelivery = async function(delivery, match, ballInfo, nextEvent) {
    debug('Processing delivery %i.%i', ballInfo.over, ballInfo.ball);

    let event = {
        match: match.id,
        timestamp: match.startDate,
        ball: {
            battingTeam: ballInfo.battingTeam, 
            fieldingTeam: ballInfo.fieldingTeam,
            innings: ballInfo.inningNumber,
            over: parseInt(ballInfo.over),
            delivery: parseInt(ballInfo.delivery)
        }
    };

    // Create or retrieve player records
    let batsman; // Placeholder for batsman that is the subject of the event when it is not clear
    const didCross = (delivery.non_striker && nextEvent) ? nextEvent.batsman == delivery.non_striker : false; // Figure out if batsman have crossed in this delivery before translating players to ids. Used if eventType = caught

    try {
        if(delivery.batsman) { 
            let player = await api.findOrCreatePlayer(delivery.batsman, event.ball.battingTeam);
            event.batsmen = {}
            event.batsmen.striker = player.id;
        }
        if(delivery.bowler) {
            let player = await api.findOrCreatePlayer(delivery.bowler, event.ball.fieldingTeam);
            event.bowler = player.id;
        }
        if(delivery.non_striker) {
            let player = await api.findOrCreatePlayer(delivery.non_striker, event.ball.battingTeam);
            event.batsmen ? null : event.batsmen = {}
            event.batsmen.nonStriker = player.id;
        }
        if(delivery.wicket && delivery.wicket.fielders) { 
            let player = await api.findOrCreatePlayer(delivery.wicket.fielders[0], event.ball.fieldingTeam);
            event.fielder = player.id;
        }
        if(delivery.wicket && delivery.wicket.player_out) {
            let player = await api.findOrCreatePlayer(delivery.wicket.player_out, event.ball.battingTeam);
            batsman = player.id;
        }
    }
    catch(error) { 
        debug('Problem creating / retrieving player records: %o', error);
        throw error; 
    }

    // Determine event type
    if(delivery.extras) {
        if(delivery.extras.noballs) event.eventType = 'noBall';
        else if(delivery.extras.wides) event.eventType = 'wide';
        else if(delivery.extras.legbyes) event.eventType = 'legBye';
        else if(delivery.extras.byes) event.eventType = 'bye';
        else if(delivery.extras.penalty) event.eventType = 'penaltyRuns';
    }
    else if(delivery.wicket) {
        if(delivery.wicket.kind == 'caught') event.eventType = 'caught';
        else if(delivery.wicket.kind == 'run out') event.eventType = 'runOut';
        else if(delivery.wicket.kind == 'bowled') event.eventType = 'bowled';
        else if(delivery.wicket.kind == 'lbw') event.eventType = 'lbw';
        else if(delivery.wicket.kind == 'caught and bowled') event.eventType = 'caught';
        else if(delivery.wicket.kind == 'stumped') event.eventType = 'stumped';
        else if(delivery.wicket.kind == 'hit wicket') event.eventType = 'hitWicket';
        else if(delivery.wicket.kind == 'obstructing the field') event.eventType = 'obstruction';
        else if(delivery.wicket.kind == 'hit the ball twice') event.eventType = 'doubleHit';
        else if(delivery.wicket.kind == 'handled the ball') event.eventType = 'handledBall';
        else if(delivery.wicket.kind == 'timed out') event.eventType = 'timedOut';
        else if(delivery.wicket.kind == 'retired hurt') event.eventType = 'retired';
    }
    else event.eventType = 'delivery';

    // Process based on event type
    try { event = processDeliveryType[event.eventType](delivery, event, batsman, didCross); }
    catch(error) { 
        debug('Invalid eventType: %o', error);
        throw error;
    }
    debug('Successfully processed delivery event: %o', event);
    return event;
}

processDeliveryType = {
    bowled: function(delivery, event) { return event },
    lbw: function(delivery, event) { return event },
    stumped: function(delivery, event) { return event },
    hitWicket: function(delivery, event) { return event },
    doubleHit: function(delivery, event) { return event },
    handledBall: function(delivery, event) { return event },
    retired: function(delivery, event, batsman) { return { ...event, batsman } },
    timedOut: function(delivery, event, batsman) { return { ...event, batsman } },
    obstruction: function(delivery, event, batsman) { return { ...event, batsman } },
    delivery: function(delivery, event) { return { ...event, runs: delivery.runs.batsman } },
    noBall: function(delivery, event) { return { ...event, runs: delivery.runs.batsman } },
    wide: function(delivery, event) { return { ...event, runs: delivery.runs.total - 1 } },
    legBye: function(delivery, event) { return { ...event, runs: delivery.runs.total } },
    bye: function(delivery, event) { return { ...event, runs: delivery.runs.total } },
    caught: function(delivery, event, batsman, didCross) { 
        return { ...event, didCross } 
    }, 
    penaltyRuns: function(delivery, event) {
        return { 
            ...event, 
            runs: delivery.runs.total
        };
    },
    runOut: function(delivery, event, batsman) {
        return { 
            ...event, 
            runs: delivery.runs.total,
            batsman
        };
    }
}

module.exports = { processInning };
