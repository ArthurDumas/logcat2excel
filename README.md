# logcat2excel

Simple Node.js tool to convert an Android logcat file into an Excel spreadsheet (using the excel4node package).


Create a .xlsx file for each .logcat file in the current wording directory.
> Usage: node index.js

Create a .xlsx file for each .logcat file in [folder].

> Usage: node index.js [folder]

Create a .xlsx file for [logcat-file].

> Usage: node index.js [logcat-file]

Logcat file must have extension .logcat.

Logcat file is skipped if .xlsx file with same name already exists.

Customize dataStyles regular expressions in the logcat2excel() function for custom color coding.

## To do

1. Create Excel worksheet as a formatted table.
2. Improve regex line parser.

## To use

1. npm install
2. node index.js
