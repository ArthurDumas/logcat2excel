// Usage: node index.js [folder]
//      Create a .xlsx file for each .logcat file in [folder].
//
// Usage: node index.js [logcat-file]
//      Create a .xlsx file for [logcat-file].
//
// If neither [folder] or [logcat-file] is specified,
// will use folder ./ (current working directory).
//
// Logcat file must have extension .logcat or .log.
//
// Logcat file is skipped if .xlsx file with same name already exists.

// Dev notes:
//      Customize dataStyles regular expressions in logcat2excel() for custom color coding.

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const excel = require('excel4node');
const LOGCAT_EXTENSION = '.logcat';
const LOG_EXTENSION = '.log';
const XLSX_EXTENSION = '.xlsx';

// command line handler
let filePaths = [];
if (process.argv.length > 2) {
    const f = process.argv[2]; // might be a single logcat file or a folder that contains logcat files
    if (fs.existsSync(f)) {
        const lstat = fs.lstatSync(f);
        if (lstat.isFile()) {
            if (path.extname(f).toLowerCase() === LOGCAT_EXTENSION || path.extname(f).toLowerCase() === LOG_EXTENSION) {
                filePaths.push(path.resolve(f));
            } else {
                console.log(`File must have extension ${LOGCAT_EXTENSION} or ${LOG_EXTENSION}`);
            }
        } else {
            filePaths = getLogcatFilesInFolder(path.resolve(f));
        }
    } else {
        console.log(`Cannot find ${f}`);
    }
} else {
    filePaths = getLogcatFilesInFolder(path.resolve('./'));
}

if (filePaths.length === 0) {
    console.log('Nothing to do');
} else {
    console.log(`Processing ${filePaths.length} logcat file${(filePaths.length) > 1 ? 's' : ''}`);

    // start the single file at a time iteration
    // (doing a single file at a time to avoid large memory consumption)
    iterate(filePaths, 0, () => {
        console.log('Done');
    });
}

function iterate(filePaths, index, done)
{
    if (index < filePaths.length) {
        const logcatPath = filePaths[index];
        const xlsxPath = logcatToXlsxPath(logcatPath);

        if (fs.existsSync(xlsxPath)) {
            console.log(`Skipping ${logcatPath} because ${xlsxPath} already exists`);
            iterate(filePaths, index + 1, done); // next iteration
        } else if (isUtf16WithBOM(logcatPath)) {
            console.log(`Skipping ${logcatPath} because it doesn't use ascii or utf8 encoding`);
            iterate(filePaths, index + 1, done); // next iteration
        } else {
            logcat2excel(logcatPath, xlsxPath, () => {
                iterate(filePaths, index + 1, done); // next iteration
            });
        }
    } else {
        done();
    }
}

function logcat2excel(logcatPath, xlsxPath, done) {
    console.log(`Creating ${xlsxPath} for ${logcatPath}`);
    const workbook = new excel.Workbook({
        logLevel: 0, // 0 - 5. 0 suppresses all logs, 1 shows errors only, 5 is for debugging
        author: 'https://github.com/ArthurDumas/logcat2excel',
    });

    const PARSED_COL_LINE = 1;
    const PARSED_COL_TIME = 2;
    const PARSED_COL_LEVEL = 3;
    const PARSED_COL_TAG = 4;
    const PARSED_COL_PID = 5;
    const PARSED_COL_TID = 6;
    const PARSED_COL_DATA = 7;

    const parsedWorksheet = workbook.addWorksheet('Parsed');
    parsedWorksheet.cell(1, PARSED_COL_LINE).string('Line');
    parsedWorksheet.cell(1, PARSED_COL_TIME).string('Time');
    parsedWorksheet.cell(1, PARSED_COL_LEVEL).string('Level');
    parsedWorksheet.cell(1, PARSED_COL_TAG).string('Tag');
    parsedWorksheet.cell(1, PARSED_COL_PID).string('PID');
    parsedWorksheet.cell(1, PARSED_COL_TID).string('TID');
    parsedWorksheet.cell(1, PARSED_COL_DATA).string('Data');

    const rawWorksheet = workbook.addWorksheet('Raw');

    const timeStyle = workbook.createStyle({
        numberFormat: 'm/d/yyyy h:mm:ss.000'
    });

    // levelStyles is indexed by parsed logcat level (I, W, E, V, etc.)
    const levelStyles = {
        E: workbook.createStyle({
            fill: {
                type: 'pattern',
                patternType: 'solid',
                bgColor: '000000',
                fgColor: 'ffc7ce'
            }
        }),
        W: workbook.createStyle({
            fill: {
                type: 'pattern',
                patternType: 'solid',
                bgColor: '000000',
                fgColor: 'ffeb9c'
            }
        })
    };

    const dataStyles = [
        {
            regex: /gpsi|v2app|v2ui|v2launch|v2log|visage/i,
            style: workbook.createStyle({
                fill: {
                    type: 'pattern',
                    patternType: 'solid',
                    bgColor: '000000',
                    fgColor: 'a9d08e'
                }
            })
        },
        {
            regex: /edison|shark/i,
            style: workbook.createStyle({
                fill: {
                    type: 'pattern',
                    patternType: 'solid',
                    bgColor: '000000',
                    fgColor: 'f4b084'
                }
            })
        },
        {
            regex: /^---/,
            style: workbook.createStyle({
                font: {
                    bold: true
                }
            })
        }
    ];

    const rl = readline.createInterface({
        input: fs.createReadStream(logcatPath),
        crlfDelay: Infinity
    });

    let lineNum = 1;

    rl.on('line', (line) => {
        rawWorksheet.cell(lineNum, 1).string(line);

        const parsedLineNum = lineNum + 1; // to account for header row
        const parsed = parseLogcatLine(line);
        parsedWorksheet.cell(parsedLineNum, PARSED_COL_LINE).number(lineNum);
        parsedWorksheet.cell(parsedLineNum, PARSED_COL_TIME).string(parsed.time).style(timeStyle);
        parsedWorksheet.cell(parsedLineNum, PARSED_COL_LEVEL).string(parsed.level);
        parsedWorksheet.cell(parsedLineNum, PARSED_COL_TAG).string(parsed.tag);
        parsedWorksheet.cell(parsedLineNum, PARSED_COL_PID).string(parsed.pid);
        parsedWorksheet.cell(parsedLineNum, PARSED_COL_TID).string(parsed.tid);
        parsedWorksheet.cell(parsedLineNum, PARSED_COL_DATA).string(parsed.data);

        if (levelStyles.hasOwnProperty(parsed.level)) {
            parsedWorksheet.cell(parsedLineNum, PARSED_COL_LINE).style(levelStyles[parsed.level]);
            parsedWorksheet.cell(parsedLineNum, PARSED_COL_TIME).style(levelStyles[parsed.level]);
            parsedWorksheet.cell(parsedLineNum, PARSED_COL_LEVEL).style(levelStyles[parsed.level]);
        }

        // first regex to match will be used
        for (const dataStyle of dataStyles) {
            if (dataStyle.regex.test(parsed.tag)) {
                parsedWorksheet.cell(parsedLineNum, PARSED_COL_TAG).style(dataStyle.style);
                break;
            }
        }
        for (const dataStyle of dataStyles) {
            if (dataStyle.regex.test(parsed.data)) {
                parsedWorksheet.cell(parsedLineNum, PARSED_COL_DATA).style(dataStyle.style);
                break;
            }
        }

        ++lineNum;
    }).on('close', () => {
        // done reading all the lines of the logcat file
        workbook.write(xlsxPath, (err, stats) => {
            if (err) {
                console.log(err);
            } else {
                console.log(`Saved ${xlsxPath}`);
            }
            done();
        });
    });
};

function parseLogcatLine(line) {
    const parsed = {
        time: '',
        level: '',
        tag: '',
        pid: '',
        tid: '',
        data: ''
    };

    // Test regular expressions with https://regex101.com/ or https://regexr.com/

    // logcat -v time
    // RegEx captures: (time) (level) (tag) (pid) (data)
    // This parser assumes "logcat -v time" output format.
    // Sample logcat lines to test parsing:
    //      12-31 16:00:03.025 D/free_area_init_node(    0): node 0, pgdat c10bd100, node_mem_map d9000000
    //      12-31 16:00:03.024 I/        (    0): Initializing cgroup subsys cpuacct
    //      04-20 15:10:49.960 I/am_on_resume_called( 1250): [0,crc64ba911c6b925d7b6e.SplashScreen,RESUME_ACTIVITY]
    //      04-20 15:10:51.317 W/ActivityManager(  510): Slow operation: 71ms so far, now at startProcess: done updating pids map
    //      12-31 19:00:01.680 I/auditd  (  192): type=1403 audit(0.0:2): policy loaded auid=4294967295 ses=4294967295
    //      12-31 19:00:25.246 I/(hci_tty)(    0): inside hci_tty_open (d6d7db28, d79fdb40)
    const regexTime = /(^\d\d-\d\d \d\d:\d\d:\d\d\.\d\d\d) (.)\/(.+?)\s*\(\s*(\d+)\): (.*)/;

    // logcat -v threadtime
    // RegEx captures: (time) (pid) (tid) (level) (tag) (data)
    // Sample logcat lines to test parsing:
    //      12-31 19:00:00.400   191   191 I auditd  : type=2000 audit(0.0:1): initialized
    //      04-27 11:19:19.131  1238  1646 I art     : Starting a blocking GC Explicit
    const regexThreadtime = /(^\d\d-\d\d \d\d:\d\d:\d\d\.\d\d\d)\s+(\d+)\s+(\d+)\s+(.)\s+(.*?)\s*: (.*)/;

    const parseHandlers = [
        { // logcat -v time
            regex: regexTime,
            numMatches: 6,
            fn: (parsed, matches) => {
                parsed.time = matches[1];
                parsed.level = matches[2];
                parsed.tag = matches[3];
                parsed.pid = matches[4];
                parsed.data = matches[5];
            }
        },
        { // logcat -v threadtime
            regex: regexThreadtime,
            numMatches: 7,
            fn: (parsed, matches) => {
                parsed.time = matches[1];
                parsed.pid = matches[2];
                parsed.tid = matches[3];
                parsed.level = matches[4];
                parsed.tag = matches[5];
                parsed.data = matches[6];
            }
        },
        { // default catch-all
            regex: /.*/,
            numMatches: 1,
            fn: (parsed, matches) => {
                parsed.data = matches[0];
            }
        }
    ];

    // first regex to match will be used
    for (const parseHandler of parseHandlers) {
        const matches = line.match(parseHandler.regex);
        const goodParse = matches && (matches.length === parseHandler.numMatches);
        if (goodParse) {
            parseHandler.fn(parsed, matches);
            break;
        }
    }

    return parsed;
};

function getLogcatFilesInFolder(folderPath) {
    console.log(`Searching for logcats in ${folderPath}`);
    return fs.readdirSync(folderPath)
        .filter((file) => (path.extname(file).toLowerCase() === LOGCAT_EXTENSION) || (path.extname(file).toLowerCase() === LOG_EXTENSION))
        .map((file) => path.join(folderPath, file));
}

function logcatToXlsxPath(filePath) {
    const parts = path.parse(filePath);
    return path.join(parts.dir, parts.name + XLSX_EXTENSION);
}

// Byte order mark isn't required to start a utf16 or utf8 file but it
// does seem to be present in files saved by PowerShell in UCS2-LE encoding
// so at least testing for that common scenario since I couldn't figure out
// how to get readline and RegEx to work with utf16.
// https://stackoverflow.com/questions/50045841/how-to-detect-file-encoding-in-nodejs
function getFileEncodingFromBOM(f) {
    var d = new Buffer.alloc(5, [0, 0, 0, 0, 0]);
    var fd = fs.openSync(f, 'r');
    fs.readSync(fd, d, 0, 5, 0);
    fs.closeSync(fd);

    let e = 'ascii';
    if (d[0] === 0xEF && d[1] === 0xBB && d[2] === 0xBF) {
        e = 'utf8';
    } else if (d[0] === 0xFE && d[1] === 0xFF) {
        e = 'utf16be';
    } else if (d[0] === 0xFF && d[1] === 0xFE) {
        e = 'utf16le';
    }

    return e;
}

function isUtf16WithBOM(f) {
    const e = getFileEncodingFromBOM(f);
    return (e === 'utf16be') || (e === 'utf16le');
}
