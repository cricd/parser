const debug = require('debug')('parser');
const readdir = require('readdir-enhanced');
const yaml = require('node-yaml');
const _ = require('underscore');
const api = require('./api');
const matchInfo = require('./matchInfo');
const ballsAndInnings = require('./ballsAndInnings');
const ProgressBar = new require('multi-progress')();
const fs = require('fs');
const sane = require('sane');

const directoryToImport = 'import';

getFilesToImport = function() {
    let filesToImport = [];
    
    try { filesToImport = readdir.sync(directoryToImport, { filter: '*.yaml' }); }
    catch(err) { debug('Error reading import directory: %s', err) }
    
    debug('Found %i file(s) to import', filesToImport.length);  
    return filesToImport;  
};

parseFile = function(file) {
    const fullPath = directoryToImport + '/' + file;
    try { 
        const file = yaml.readSync(fullPath); 
        debug('Successfully read %s', fullPath);
        return file;
    }
    catch(err) { debug('Error reading %s: %s', fullPath, err) }
}

completeFile = async function(file) {
    const fullPath = directoryToImport + '/' + file;

    let promise = new Promise((resolve, reject) => {
        fs.rename(fullPath, fullPath + '.complete', function(err) {
            if(err) return reject(err);
            debug('Successfully renamed completed file %s', file);
            resolve(fullPath + '.complete');
        });
    });
    return promise;
}

processFile = async function(file) {
    let fileProgress = ProgressBar.newBar(':update [:bar] :current/:total',
        { total: 9 }    
    );
    fileProgress.tick(0);    

    // Step 1. Parse file
    fileProgress.tick({ update: file + ' - Parsing file...' });    
    const parsedFile = parseFile(file);

    // Step 2. Extract match details 
    fileProgress.tick({ update: file + ' - Extracting match details...' });    
    const details = matchInfo.extractMatchDetails(parsedFile.info, parsedFile.innings);
    
    // Step 3. Extract umpires
    fileProgress.tick({ update: file + ' - Extracting umpires...' });    
    let umpires = [];
    try { umpires = await matchInfo.extractUmpires(parsedFile.info); }
    catch(error) { return console.log('Problem whilst extracting umpires: %s', error); }
    
    // Step 4. Extract teams
    fileProgress.tick({ update: file + ' - Extracting teams...' });    
    let teams;
    try { teams = await matchInfo.extractTeams(parsedFile.info); }
    catch(error) { return console.log('Problem whilst extracting teams: %s', error); }

    // Step 5. Create match
    fileProgress.tick({ update: file + ' - Creating match...' });    
    let match = { 
        ...details,
        umpires: _(umpires).pluck('id'), 
        homeTeam: teams.homeTeam.id,
        awayTeam: teams.awayTeam.id
    };
    try { match = await api.createMatch(match); }
    catch(error) { return console.log('Problem whilst creating match: %s', error); }
   
    // Step 6. Iterate through Innings and balls
    fileProgress.tick({ update: file + ' - Iterating through innings and balls...' });     

    let events = [];
    const innings = parsedFile.innings;

    for(const inning in innings) {
        var inningsEvents = [];
        try { inningsEvents = await ballsAndInnings.processInning(innings[inning], match, parseInt(inning) + 1); }
        catch(error) { return console.log('Problem whilst processing ball events: %s', error); }
        events = events.concat(inningsEvents);           
    }
    
    // Step 7. Save events to API
    fileProgress.tick({ update: file + ' - Saving events to API...' });     

    let savedEvents = [];
    
    const eventChunks = _(events).chunk(60); // Around 10 overs
    for(const chunk in eventChunks) {
        let chunkToSave = eventChunks[chunk]; 

        try { 
            const newEvents = await api.createEvents(chunkToSave); 
            savedEvents.push(newEvents);
        }
        catch(error) { return console.log('Problem whilst creating events: %s', error); }
    }

    // Step 8. Rename file to complete
    fileProgress.tick({ update: file + ' - Renaming completed file...' });     

    const completedFile = await completeFile(file);
    fileProgress.tick({ update: file + ' - Completed processing ' });   
    debug('Successfully completed processing of file: %s', completedFile);

}

 main = (async function() {
    console.log('Starting to process cricsheet files...');

    const filesToImport = await getFilesToImport();
    console.log('Imported %i files to process', filesToImport.length);
     
    if(filesToImport.length > 0) {
        let progress = ProgressBar.newBar(
            'Processing cricd yaml files... [:bar] :percent :current/:total :eta',
            { total: filesToImport.length + 1 }
        );
        progress.tick(1);    
    
        for(const index in filesToImport) {
            const file = filesToImport[index]; 
            await processFile(file);
            progress.tick();
        };
        console.log('Processed all %i initial files', filesToImport.length);
    }

    const watcher = sane('./' + directoryToImport, { glob: ['**/*.yaml'] } );
    watcher.on('ready', () => console.log('Listening for new cricsheet files...'));
    watcher.on('add', processFile);
 
})();