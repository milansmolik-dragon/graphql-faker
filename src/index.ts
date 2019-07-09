import "core-js/shim";

import {
  Source,
  parse,
  concatAST,
  buildASTSchema
} from "graphql";

import * as fs from "fs";
import * as path from "path";
import * as express from "express";
import * as graphqlHTTP from "express-graphql";
import * as cors from "cors";
import { pick } from "lodash";
import * as yargs from "yargs";

import { fakeSchema } from "./fake_schema";

const argv = yargs
  .command("$0 [file]", "", cmd =>
    cmd.options({
      port: {
        alias: "p",
        describe: "HTTP Port",
        type: "number",
        requiresArg: true,
        default: process.env.PORT || 4000
      },
      open: {
        alias: "o",
        describe: "Open page with IDL editor and GraphiQL in browser",
        type: "boolean"
      },
      "cors-origin": {
        alias: "co",
        describe: "CORS: Define Access-Control-Allow-Origin header",
        type: "string",
        requiresArg: true
      },
      extend: {
        alias: "e",
        describe: "URL to existing GraphQL server to extend",
        type: "string",
        requiresArg: true
      },
      header: {
        alias: "H",
        describe:
          'Specify headers to the proxied server in cURL format, e.g.: "Authorization: bearer XXXXXXXXX"',
        type: "string",
        requiresArg: true,
        implies: "extend"
      },
      "forward-headers": {
        describe:
          "Specify which headers should be forwarded to the proxied server",
        type: "array",
        implies: "extend"
      }
    })
  )
  .strict()
  .help("h")
  .alias("h", "help").epilog(`Examples:

  # Mock GraphQL API based on example IDL and open interactive editor
  $0 --open

  # Extend real data from SWAPI with faked data based on extension IDL
  $0 ./ext-swapi.grqphql --extend http://swapi.apis.guru/

  # Extend real data from GitHub API with faked data based on extension IDL
  $0 ./ext-gh.graphql --extend https://api.github.com/graphql \\
  --header "Authorization: bearer <TOKEN>"`).argv;


let headers = {};
if (argv.header) {
  const headerStrings = Array.isArray(argv.header)
    ? argv.header
    : [argv.header];
  for (const str of headerStrings) {
    const index = str.indexOf(":");
    const name = str.substr(0, index).toLowerCase();
    const value = str.substr(index + 1).trim();
    headers[name] = value;
  }
}

const forwardHeaderNames = (argv.forwardHeaders || []).map(str =>
  str.toLowerCase()
);

const fakeDefinitionAST = readAST(
  path.join(__dirname, "fake_definition.graphql")
);
const corsOptions = {};

if (argv.co) {
  corsOptions["origin"] = argv.co;
  corsOptions["credentials"] = true;
}

function readIDL(filepath) {
  return new Source(fs.readFileSync(filepath, "utf-8"), filepath);
}

function readAST(filepath) {
  return parse(readIDL(filepath));
}

function buildServerSchema(idl) {
  var ast = concatAST([parse(idl), fakeDefinitionAST]);
  return buildASTSchema(ast);
}
function runServer(
  schemaIDL: Source,
  port: number,
  extensionIDL: Source,
  optionsCB
) {
  const app = express();
  app.options("", cors(corsOptions));
  const schema = buildServerSchema(schemaIDL);

  app.use(
    "",
    cors(corsOptions),
    graphqlHTTP(req => {
      const forwardHeaders = pick(req.headers, forwardHeaderNames);
      return {
        ...optionsCB(schema, extensionIDL, forwardHeaders),
        graphiql: true
      };
    })
  );
  console.log(`Fake server running at http://localhost:${port}`);

  return app.listen(port);
}

export const server = {
  run: function(mockSchema, port = 4000) {
    let source = new Source(
      mockSchema
        .replace(/"""\n  .*?\n  """/g, "")
        .replace(/directive @examples *\n/, "")
        .replace(/directive @sample *\n/, ""),
      `./temp.graphql`
    );
    return runServer(source, port, null, schema => {
      fakeSchema(schema);
      return { schema };
    });
  }
};
