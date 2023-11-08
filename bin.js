#!/usr/bin/env node
const args = require('minimist')(process.argv.slice(2))

require('./').attach(args._[0], args)
