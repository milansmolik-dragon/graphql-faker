FROM node:8.8.1-alpine

ENTRYPOINT ["node", "/usr/local/bin/graphql-faker-sampled"]
WORKDIR /workdir

EXPOSE 4000

RUN yarn global add graphql-faker-sampled && \
    yarn cache clean --force
