const debug = require('debug')('parser:match');
const api = require('./api');

var exports = module.exports = {};

exports.extractMatchDetails = function(info, innings) {
    let details = {};
    details.location = info.city;
    details.venue = info.venue;
    details.startDate = info.dates[0]
    details.numberOfInnings = innings.length > 2 ? 2 : 1;
    details.numberOfOvers = info.overs;
    return details;
}

exports.extractTeams = async function(info) {
    debug('Extracting teams from match info...');

    const homeTeam = await api.findOrCreate('teams', info.teams[0]);
    const awayTeam = await api.findOrCreate('teams', info.teams[1]);

    const teams = { homeTeam, awayTeam };
    debug('Succesfully extracted teams: %o %o', homeTeam, awayTeam);
    return teams;
}

exports.extractUmpires = async function(info) {
    debug('Extracting umpires from match info...');

    const results = info.umpires.map(async (umpire) => await api.findOrCreate('umpires', umpire) );
    const umpires = await Promise.all(results);
    debug('Succesfully extracted umpires: %o', umpires);
    return umpires;
}
