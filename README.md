# logcat2excel

Simple Node.js tool to convert an Android logcat file into an Excel spreadsheet (using the excel4node package).

Create a .xlsx file for each .logcat file in the current working directory:
> Usage: node index.js

Create a .xlsx file for each .logcat file in [folder]:

> Usage: node index.js [folder]

Create a .xlsx file for [logcat-file]:

> Usage: node index.js [logcat-file]

Logcat must be created with the "-v time" or "-v threadtime" output format. Threadtime is the logcat default if -v isn't specified.

Logcat file must be in ascii or utf8 encoding. If running adb logcat from PowerShell, be sure to change the default encoding with something like this: "adb logcat -b all -d | out-file -encoding utf8 myLog.logcat".

Logcat file must have extension .logcat or .log.

Command line doesn't support wildcards (i.e., \*.logcat)

Logcat file is skipped if .xlsx file with same name already exists.

Customize dataStyles regular expressions in the logcat2excel() function for custom color coding of tags and data.

## To do

- Create Excel worksheet as a formatted table. Not supported by excel4node at this time.

## To use

1. npm install
2. node index.js
