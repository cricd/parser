var debug = require('debug')('parser:api');
const fetch = require('node-fetch');

// Configuration variables
var host = process.env.API_HOST ? process.env.API_HOST : 'localhost';
var port = process.env.API_PORT ? process.env.API_PORT : 3001;

var cache = {
    players: {},
    umpires: {},
    teams: {}
};

var exports = module.exports = {};
exports.findOrCreate = async function(model, name) {
    debug('Attempting to find or create %s %s', model, name);

    if(!name) {
        var error = 'name is required';
        debug(error);
        throw error;
    }

    if(cache[model][name]) {
        debug('Found %s %s in cache', model, name);
        return cache[model][name];
    }
 
    var baseUrl = 'http://' + host + ':' + port; 
    try {
        const response = await fetch(baseUrl + '/' + model, {
            body: JSON.stringify({ name }),
            headers: { "Content-Type": "application/json" },
            method: 'POST'
        });

        const created = await response.json();
        debug('Successfully created %s: %o', model, created);
        cache[model][name] = created;
        return created;
    }
    catch(error) { throw error; }
};

exports.findOrCreatePlayer = async function(name, team) {
    debug('Attempting to find or create player %s', name);

    if(!name) {
        var error = 'name is required';
        debug(error);
        throw error;
    }

    if(cache['players'][name]) {
        debug('Found %s in cache', name);
        return cache['players'][name];
    }
 
    var baseUrl = 'http://' + host + ':' + port; 
    try {
        const response = await fetch(baseUrl + '/teams/' + team + '/players', {
            body: JSON.stringify({ name, teams: [team] }),
            headers: { "Content-Type": "application/json" },
            method: 'POST'
        });

        const created = await response.json();
        debug('Successfully created player: %o', created);
        cache['players'][name] = created;
        return created;
    }
    catch(error) { throw error; }
};

exports.createMatch = async function(match) {
    debug('Attempting to create match: %o', match);
 
    var baseUrl = 'http://' + host + ':' + port; 

    try {
        const response = await fetch(baseUrl + '/matches', {
            body: JSON.stringify(match),
            headers: { "Content-Type": "application/json" },
            method: 'POST'
        });

        const created = await response.json();
        debug('Successfully created match: %o', created);
        return created;
    }
    catch(error) { throw error; }
}

exports.createEvents = async function(events) {
    debug('Attempting to create %i events', events.length);
 
    var baseUrl = 'http://' + host + ':' + port; 

    try {
        const response = await fetch(baseUrl + '/matchEvents', {
            body: JSON.stringify(events),
            headers: { "Content-Type": "application/json" },
            method: 'POST'
        });

        const created = await response.json();
        debug('Successfully created %i events', created.length);
        return created;
    }
    catch(error) { throw error; }
}