import 'core-js/shim';

import {
  Source,
  parse,
  concatAST,
  buildASTSchema,
  GraphQLError,
} from 'graphql';
const { ApolloServer, gql } = require ('apollo-server')
import * as fs from 'fs';
import * as path from 'path';
import * as express from 'express';
import * as graphqlHTTP from 'express-graphql';
import chalk from 'chalk';
//import * as opn from 'opn';
import * as cors from 'cors';
import * as bodyParser from 'body-parser';
import { pick } from 'lodash';
import * as yargs from 'yargs';
import * as cJSON from 'circular-json'
import * as FormatError from 'easygraphql-format-error'

import { fakeSchema } from './fake_schema';
import { proxyMiddleware } from './proxy';
import { existsSync } from './utils';

const argv = yargs
  .command('$0 [file]', '', cmd => cmd.options({
    'port': {
      alias: 'p',
      describe: 'HTTP Port',
      type: 'number',
      requiresArg: true,
      default: process.env.PORT || 4000,
    },
    'open': {
      alias: 'o',
      describe: 'Open page with IDL editor and GraphiQL in browser',
      type: 'boolean',
    },
    'cors-origin': {
      alias: 'co',
      describe: 'CORS: Define Access-Control-Allow-Origin header',
      type: 'string',
      requiresArg: true,
    },
    'extend': {
      alias: 'e',
      describe: 'URL to existing GraphQL server to extend',
      type: 'string',
      requiresArg: true,
    },
    'header': {
      alias: 'H',
      describe: 'Specify headers to the proxied server in cURL format, e.g.: "Authorization: bearer XXXXXXXXX"',
      type: 'string',
      requiresArg: true,
      implies: 'extend',
    },
    'forward-headers': {
      describe: 'Specify which headers should be forwarded to the proxied server',
      type: 'array',
      implies: 'extend',
    },
  }))
  .strict()
  .help('h')
  .alias('h', 'help')
  .epilog(`Examples:

  # Mock GraphQL API based on example IDL and open interactive editor
  $0 --open

  # Extend real data from SWAPI with faked data based on extension IDL
  $0 ./ext-swapi.grqphql --extend http://swapi.apis.guru/

  # Extend real data from GitHub API with faked data based on extension IDL
  $0 ./ext-gh.graphql --extend https://api.github.com/graphql \\
  --header "Authorization: bearer <TOKEN>"`)
  .argv


const log = console.log;

let headers = {};
if (argv.header) {
  const headerStrings = Array.isArray(argv.header) ? argv.header : [argv.header];
  for (const str of headerStrings) {
    const index = str.indexOf(':');
    const name = str.substr(0, index).toLowerCase();
    const value = str.substr(index + 1).trim();
    headers[name] = value;
  }
}

const forwardHeaderNames = (argv.forwardHeaders || []).map(
  str => str.toLowerCase()
);

const fileName = argv.file || (argv.extend ?
  './schema_extension.faker.graphql' :
  './schema.faker.graphql');


if (!argv.file) {
  log(chalk.yellow(`Default file ${chalk.magenta(fileName)} is used. ` +
  `Specify [file] parameter to change.`));
}

const fakeDefinitionAST = readAST(path.join(__dirname, 'fake_definition.graphql'));
const corsOptions = {}

if (argv.co) {
  corsOptions['origin'] =  argv.co
  corsOptions['credentials'] =  true
}

let userIDL;
if (existsSync(fileName)) {
  userIDL = readIDL(fileName);
} else {
  // different default IDLs for extend and non-extend modes
  let defaultFileName = argv.e ? 'default-extend.graphql' : 'default-schema.graphql';
  userIDL = readIDL(path.join(__dirname, defaultFileName));
}

function readIDL(filepath) {
  return new Source(
    fs.readFileSync(filepath, 'utf-8'),
    filepath
  );
}

function readAST(filepath) {
  return parse(readIDL(filepath));
}

function saveIDL(idl) {
  fs.writeFileSync(fileName, idl);
  log(`${chalk.green('✚')} schema saved to ${chalk.magenta(fileName)} on ${(new Date()).toLocaleString()}`);
  return new Source(idl, fileName);
}

// if (argv.e) {
if (false) {
  // run in proxy mode
  const url = argv.e;
  proxyMiddleware(url, headers)
    .then(([schemaIDL, cb]) => {
      schemaIDL = new Source(schemaIDL, `Inrospection from "${url}"`);
      runServer(schemaIDL, null, userIDL, cb)
    })
    .catch(error => {
      log(chalk.red(error.stack));
      process.exit(1);
    });
//} else {
  runServer(userIDL,null, null, schema => {
    fakeSchema(schema)
    return {schema};
  });
}

function buildServerSchema(idl) {
  var ast = concatAST([parse(idl), fakeDefinitionAST]);
  return buildASTSchema(ast);
}

const formatError = new FormatError ([
  {
    name: 'ERR_PAY_013',
    errorCode: 'ERR_PAY_013',
    message: 'Panic!',
    statusCode: 400,
  }
])
class customError extends Error {
  statusCode: number
  constructor (name: string, statusCode: number, message?: string) {
    super(message)
    this.name = name
    this.statusCode = statusCode
  }
}

function runServer(schemaIDL: Source, error: String = null, extensionIDL: Source = null, optionsCB) {
  const root = {Mutation: {makeTransfer: (args) => new GraphQLError('ERR_PAY_013')},}
  let schema = buildServerSchema(schemaIDL);
  fakeSchema(schema)

  const server = new ApolloServer ({
      schema,
      resolvers: root,
  })
  
  server.listen().then(({ url }) =>{ 
  console.log(`Server started, listening on ${url}`)})

}


export const server = {
  run: function (fileName) {
    const userIDL = readIDL(fileName);
    return runServer(userIDL, null, null, schema => {
    fakeSchema(schema)
    return {schema};
  })}
}