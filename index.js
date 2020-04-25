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
            }
        } else {
            filePaths = getLogcatFilesInFolder(path.resolve(f));
        }
    }
} else {
    filePaths = getLogcatFilesInFolder(path.resolve('./'));
}

if (filePaths.length === 0) {
    console.error('Nothing to do');
} else {
    // start the single file at a time iteration
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
    const workbook = new excel.Workbook();

    const parsedWorksheet = workbook.addWorksheet('Parsed');
    parsedWorksheet.cell(1, 1).string('Line');
    parsedWorksheet.cell(1, 2).string('Time');
    parsedWorksheet.cell(1, 3).string('Level');
    parsedWorksheet.cell(1, 4).string('Tag');
    parsedWorksheet.cell(1, 5).string('PID');
    parsedWorksheet.cell(1, 6).string('Data');

    const rawWorksheet = workbook.addWorksheet('Raw');

    const dateStyle = workbook.createStyle({
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
        }
    ];

    const rl = readline.createInterface({
        input: fs.createReadStream(logcatPath),
        crlfDelay: Infinity
    });

    let lineNum = 1;

    rl.on('line', (line) => {
        rawWorksheet.cell(lineNum, 1).string(line);

        const parsed = parseLogcatLine(line);
        parsedWorksheet.cell(lineNum + 1, 1).number(lineNum);
        parsedWorksheet.cell(lineNum + 1, 2).string(parsed.time).style(dateStyle);
        parsedWorksheet.cell(lineNum + 1, 3).string(parsed.level);
        parsedWorksheet.cell(lineNum + 1, 4).string(parsed.tag);
        parsedWorksheet.cell(lineNum + 1, 5).string(parsed.pid);
        parsedWorksheet.cell(lineNum + 1, 6).string(parsed.data);
 
        if (levelStyles.hasOwnProperty(parsed.level)) {
            parsedWorksheet.cell(lineNum + 1, 1).style(levelStyles[parsed.level]);
            parsedWorksheet.cell(lineNum + 1, 2).style(levelStyles[parsed.level]);
            parsedWorksheet.cell(lineNum + 1, 3).style(levelStyles[parsed.level]);
        }

        // first regex to match will be used
        for (const dataStyle of dataStyles) {
            if (dataStyle.regex.test(parsed.tag)) {
                parsedWorksheet.cell(lineNum + 1, 4).style(dataStyle.style);
                break;
            }
        }
        for (const dataStyle of dataStyles) {
            if (dataStyle.regex.test(parsed.data)) {
                parsedWorksheet.cell(lineNum + 1, 6).style(dataStyle.style);
                break;
            }
        }

        ++lineNum;
    }).on('close', () => {
        // done reading all the lines of the file
        workbook.write(xlsxPath);
        console.log(`Saved ${xlsxPath}`);
        done();
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
    // https://regexr.com/
    // 12-31 16:00:03.025 D/free_area_init_node(    0): node 0, pgdat c10bd100, node_mem_map d9000000
    // 12-31 16:00:03.024 I/        (    0): Initializing cgroup subsys cpuacct
    // 04-20 15:10:49.960 I/am_on_resume_called( 1250): [0,crc64ba911c6b925d7b6e.SplashScreen,RESUME_ACTIVITY]
    // 04-20 15:10:51.317 W/ActivityManager(  510): Slow operation: 71ms so far, now at startProcess: done updating pids map
    // The following logcat line required the use of lazy match (.*?) to prevent the first (.*) from eating through the first parens:
    // 12-31 19:00:01.680 I/auditd  (  192): type=1403 audit(0.0:2): policy loaded auid=4294967295 ses=4294967295
    //const regex = /(^\d\d-\d\d \d\d:\d\d:\d\d\.\d\d\d) (.)\/(.*)\(\s*(.*)\)\: (.*)/;
    const regex = /(^\d\d-\d\d \d\d:\d\d:\d\d\.\d\d\d) (.)\/(.*?)\(\s*(.*?)\)\: (.*)/;
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
    return fs.readdirSync(folderPath)
        .filter((file) => (path.extname(file).toLowerCase() === LOGCAT_EXTENSION))
        .map((file) => path.join(folderPath, file));
}

function logcatToXlsxPath(filePath) {
    const parts = path.parse(filePath);
    return path.join(parts.dir, parts.name + XLSX_EXTENSION);
}
