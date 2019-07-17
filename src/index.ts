import {
  Source,
  GraphQLSchema,
  parse,
  concatAST,
  buildASTSchema
} from "graphql";

import * as path from "path";
import * as express from "express";
import * as graphqlHTTP from "express-graphql";
import * as cors from "cors";

import { fakeSchema } from "./fake_schema";
import { readSDL } from "./utils";

const fakeDefinitionAST = parse(
  readSDL(path.join(__dirname, "fake_definition.graphql"))
);

function runServer(userSDL: Source, port?: number) {
  const corsOptions = {
    credentials: true
  };
  const app = express();
  const schema = buildSchema(userSDL);
  app.options("", cors(corsOptions));
  app.use(
    "",
    cors(corsOptions),
    graphqlHTTP(() => ({
      schema,
      graphiql: true
    }))
  );

  const server = app.listen(port);

  console.log(`\nRunning fake server on http://localhost:${port}`);

  return server;
}

function buildSchema(schemaSDL: Source): GraphQLSchema {
  var mergedAST = concatAST([parse(schemaSDL), fakeDefinitionAST]);
  let schema = buildASTSchema(mergedAST);
  fakeSchema(schema);
  return schema;
}
var server;
export default {
  run: (source, port = 4000) => {
    const userSDL = source
      .replace(/directive @example[a-zA-Z ():,_|]*\n/, "")
      .replace(/directive @sample[a-zA-Z ():,_|]*\n/, "")
      .replace(/directive @fake[a-zA-Z ():,_|]*\n/, "");
    server = runServer(userSDL, port);
  },

  getServer: () => {
    return server;
  },

  close: () => {
    server.close();
    process.exit(0);
  }
};
