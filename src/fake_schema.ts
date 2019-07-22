import * as assert from "assert";
import {
  isLeafType,
  isAbstractType,
  getDirectiveValues,
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLAbstractType,
  GraphQLOutputType,
  GraphQLInputObjectType,
  GraphQLList,
  GraphQLNonNull,
  GraphQLEnumType,
  GraphQLLeafType
} from "graphql";
import * as _ from "lodash";
import {
  getRandomInt,
  getRandomItem,
  stdScalarFakers,
  fakeValue
} from "./fake";

type FakeArgs = {
  type: string;
  options: { [key: string]: any };
  locale: string;
};
type ExamplesArgs = {
  values: [any];
  type: any;
};
type SampleArgs = {
  min?: number;
  max?: number;
  size?: number;
};
type DirectiveArgs = {
  fake?: FakeArgs;
  examples?: ExamplesArgs;
  sample?: SampleArgs;
};
export function fakeSchema(schema: GraphQLSchema) {
  const fakeDirective = schema.getDirective("fake");
  const examplesDirective = schema.getDirective("examples");
  const sampleDirective = schema.getDirective("sample");
  assert(
    fakeDirective != null &&
      examplesDirective != null &&
      sampleDirective != null
  );

  const mutationType = schema.getMutationType();

  for (const type of Object.values(schema.getTypeMap())) {
    if (type instanceof GraphQLObjectType && !type.name.startsWith("__"))
      addFakeProperties(type);
    if (isAbstractType(type)) type.resolveType = obj => obj.__typename;
  }

  function addFakeProperties(objectType: GraphQLObjectType) {
    const isMutation = objectType === mutationType;

    for (const field of Object.values(objectType.getFields())) {
      if (isMutation && isRelayMutation(field))
        field.resolve = getRelayMutationResolver();
      else field.resolve = getFieldResolver(field, objectType);
    }
  }

  function isRelayMutation(field) {
    const args = field.args;
    if (args.length !== 1 || args[0].name !== "input") return false;

    const inputType = args[0].type;
    // TODO: check presence of 'clientMutationId'
    return (
      inputType instanceof GraphQLNonNull &&
      inputType.ofType instanceof GraphQLInputObjectType &&
      field.type instanceof GraphQLObjectType
    );
  }

  function getFieldResolver(field, objectType) {
    const fakeResolver = getResolver(field.type, field);
    return (source, _0, _1, info) => {
      if (source && source.$example && source[field.name]) {
        return source[field.name];
      }

      const value = getCurrentSourceProperty(source, info.path);
      return value !== undefined ? value : fakeResolver(objectType);
    };
  }

  function getRelayMutationResolver() {
    return (source, args, _1, info) => {
      const value = getCurrentSourceProperty(source, info.path);
      if (value instanceof Error) return value;
      return { ...args["input"], ...value };
    };
  }

  // get value or Error instance injected by the proxy
  function getCurrentSourceProperty(source, path) {
    return source && source[path!.key];
  }

  function getResolver(type: GraphQLOutputType, field) {
    if (type instanceof GraphQLNonNull) return getResolver(type.ofType, field);
    if (type instanceof GraphQLList)
      return arrayResolver(
        getResolver(type.ofType, field),
        getFakeDirectives(field)
      );
    if (isAbstractType(type)) return abstractTypeResolver(type, field);

    return fieldResolver(type, field);
  }

  function abstractTypeResolver(type: GraphQLAbstractType, field) {
    const directiveToArgs = {
      ...getFakeDirectives(field)
    };
    const { examples } = directiveToArgs;
    const possibleTypes = schema.getPossibleTypes(type);
    if (examples && examples.type)
      var targetType = _.find(possibleTypes, candidate => {
        return candidate.toString() == examples.type;
      });
    if (targetType) return () => ({ __typename: targetType });
    return () => ({ __typename: getRandomItem(possibleTypes) });
  }

  function fieldResolver(type: GraphQLOutputType, field) {
    const directiveToArgs = {
      ...getFakeDirectives(type),
      ...getFakeDirectives(field)
    };
    const { fake, examples } = directiveToArgs;

    if (isLeafType(type)) {
      if (examples) return () => getRandomItem(examples.values);
      if (fake) {
        return () => fakeValue(fake.type, fake.options, fake.locale);
      }
      return () => fakeLeafValue(type);
    } else {
      // TODO: error on fake directive
      if (examples) {
        return () => ({
          ...getRandomItem(examples.values),
          $example: true
        });
      }
      return () => ({});
    }
  }

  function getFakeDirectives(object): DirectiveArgs {
    const nodes = [];
    if (object.astNode != null) {
      nodes.push(object.astNode);
    }
    if (object.extensionNodes != null) {
      nodes.push(...object.extensionNodes);
    }

    let fake;
    let examples;
    let sample;
    for (const node of nodes) {
      fake = getDirectiveValues(fakeDirective, node) as FakeArgs;
      examples = getDirectiveValues(examplesDirective, node) as ExamplesArgs;
      sample = getDirectiveValues(sampleDirective, node) as SampleArgs;
    }

    return { fake, examples, sample };
  }
}

function arrayResolver(itemResolver, { sample }: DirectiveArgs) {
  const options = {
    min: 1,
    max: 1,
    ...sample
  } as SampleArgs;

  if (options.min > options.max) {
    options.max = ++options.min;
  }
  return (...args) => {
    let length;
    options.size
      ? (length = options.size)
      : (length = getRandomInt(options.min, options.max));

    const result = [];

    while (length-- !== 0) result.push(itemResolver(...args));
    return result;
  };
}

function fakeLeafValue(type: GraphQLLeafType) {
  if (type instanceof GraphQLEnumType) {
    const values = type.getValues().map(x => x.value);
    return getRandomItem(values);
  }

  const faker = stdScalarFakers[type.name];
  if (faker) return faker();
  return `<${type.name}>`;
}
