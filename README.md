# logcat2excel

Simple Node.js tool to convert an Android logcat file into an Excel spreadsheet (using the excel4node package).

Usage: node index.js

> Create a .xlsx file for each .logcat file in the current wording directory.

Usage: node index.js [folder]

> Create a .xlsx file for each .logcat file in [folder].

Usage: node index.js [logcat-file]

> Create a .xlsx file for [logcat-file].

Logcat file must have extension .logcat.

Logcat file is skipped if .xlsx file with same name already exists.

Customize dataStyles regular expressions in the logcat2excel() function for custom color coding.

## To do

Create Excel worksheet as a formatted table.

## To use

1. npm install
2. node index.js
