// Usage: node index.js [folder]
//      Create a .xlsx file for each .logcat file in [folder].
//
// Usage: node index.js [logcat-file]
//      Create a .xlsx file for [logcat-file].
//
// If neither [folder] or [logcat-file] is specified,
// will use folder ./ (current working directory).
//
// Logcat file must have extension .logcat.
//
// Logcat file is skipped if .xlsx file with same name already exists.

// Dev notes:
//      Customize dataStyles regular expressions in logcat2excel() for custom color coding.

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const excel = require('excel4node');

const LOGCAT_EXTENSION = '.logcat';
const XLSX_EXTENSION = '.xlsx';

// command line handler
let filePaths = [];
if (process.argv.length > 2) {
    const f = process.argv[2]; // might be a single logcat file or a folder that contains logcat files
    if (fs.existsSync(f)) {
        const lstat = fs.lstatSync(f);
        if (lstat.isFile()) {
            if (path.extname(f).toLowerCase() === LOGCAT_EXTENSION) {
                filePaths.push(path.resolve(f));
            } else {
                console.log(`File must have extension ${LOGCAT_EXTENSION}`);
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
    const PARSED_COL_DATA = 6;

    const parsedWorksheet = workbook.addWorksheet('Parsed');
    parsedWorksheet.cell(1, PARSED_COL_LINE).string('Line');
    parsedWorksheet.cell(1, PARSED_COL_TIME).string('Time');
    parsedWorksheet.cell(1, PARSED_COL_LEVEL).string('Level');
    parsedWorksheet.cell(1, PARSED_COL_TAG).string('Tag');
    parsedWorksheet.cell(1, PARSED_COL_PID).string('PID');
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
        data: ''
    };

    // RegEx: (time) (level) (tag) (pid) (data)
    // https://regex101.com/        https://regexr.com/
    // Sample typical logcat lines that are easy to parse:
    //      12-31 16:00:03.025 D/free_area_init_node(    0): node 0, pgdat c10bd100, node_mem_map d9000000
    //      12-31 16:00:03.024 I/        (    0): Initializing cgroup subsys cpuacct
    //      04-20 15:10:49.960 I/am_on_resume_called( 1250): [0,crc64ba911c6b925d7b6e.SplashScreen,RESUME_ACTIVITY]
    //      04-20 15:10:51.317 W/ActivityManager(  510): Slow operation: 71ms so far, now at startProcess: done updating pids map
    // The following logcat line required the use of lazy match (.*?) to prevent the first (.*) from eating through the first parens:
    //      12-31 19:00:01.680 I/auditd  (  192): type=1403 audit(0.0:2): policy loaded auid=4294967295 ses=4294967295
    // The following logcat line caused issues because the tag contains parens so changed tag group to be (.+?) instead of (.*?):
    //      12-31 19:00:25.246 I/(hci_tty)(    0): inside hci_tty_open (d6d7db28, d79fdb40)
    const regex = /(^\d\d-\d\d \d\d:\d\d:\d\d\.\d\d\d) (.)\/(.+?)\(\s*(\d+)\): (.*)/;
    const parsable = regex.test(line);
    const parts = line.match(regex);

    if (!parsable || parts.length !== 6) {
        parsed.data = line;
    } else {
        parsed.time = parts[1];
        parsed.level = parts[2];
        parsed.tag = parts[3].trimEnd(); // couldn't get regular expression to eat this optional whitespace
        parsed.pid = parts[4];
        parsed.data = parts[5];
    }

    return parsed;
};

function getLogcatFilesInFolder(folderPath) {
    console.log(`Searching for logcats in ${folderPath}`);
    return fs.readdirSync(folderPath)
        .filter((file) => (path.extname(file).toLowerCase() === LOGCAT_EXTENSION))
        .map((file) => path.join(folderPath, file));
}

function logcatToXlsxPath(filePath) {
    const parts = path.parse(filePath);
    return path.join(parts.dir, parts.name + XLSX_EXTENSION);
}
