# @cumulus/api

[![Build Status](https://travis-ci.org/nasa/cumulus.svg?branch=master)](https://travis-ci.org/nasa/cumulus)

*An API for the Cumulus Framework*

This module build the Cumulus API for the Cumulus framework. It uses a combination of AWS services to create an API interface for configuring, managing and monitoring the Cumulus framework.

For the full documentation of the API see: https://nasa.github.io/cumulus-api

## Development

### Running the API locally

To run the API locally using Localstack for AWS services without Earthdata authentication required:

```bash
  $ npm run serve
```

To run the API locally using Localstack for AWS services with Earthdata authentication required:

```bash
  EARTHDATA_CLIENT_ID=<your_client_id> \
    EARTHDATA_CLIENT_PASSWORD=<your_password> \
    USERNAME=<username> \
    npm run serve-oauth
```

**Note**: The Cumulus API checks whether the username used to login with Earthdata is an allowed user for the API. In order to add your Earthdata username as an allowed user when running the API against Localstack, you must specify it using the `USERNAME` environment variable.

To run the API locally using your deployed stack with Earthdata authentication required:

```bash
  stackName=<your_stack_name> \
    system_bucket=<your_system_bucket> \
    EARTHDATA_CLIENT_ID=<your_client_id> \
    EARTHDATA_CLIENT_PASSWORD=<your_password> \
    ES_HOST=<your_elasticsearch_host> \
    npm run serve-remote
```

If you want endpoints that interact with Elasticsearch to work, you must specify the `ES_HOST` environment variable for this command. You can get the value for `ES_HOST` for your stack using the AWS CLI, where `<your_es_domain_name>` is the value of `<stackName>-<es.name>` for your app deployment in config.yml:

```bash
  aws es describe-elasticsearch-domain --domain-name <your_es_domain_name> --query 'DomainStatus.Endpoint'
```

### Running the distribution API locally

To run the distribution API locally using Localstack for AWS services without Earthdata authentication required:

```bash
  $ npm run serve-dist
```

To run the distribution API locally using Localstack for AWS services with Earthdata authentication required:

```bash
  $ EARTHDATA_CLIENT_ID=<your_client_id> EARTHDATA_CLIENT_PASSWORD=<your_password> npm run serve-dist-oauth
```

To run the distribution API locally using your deployed stack with Earthdata authentication required:

```bash
  stackName=<your_stack_name> \
    EARTHDATA_CLIENT_ID=<your_client_id> \
    EARTHDATA_CLIENT_PASSWORD=<your_password> \
    npm run serve-dist-remote
```

In order for the locally running API to interact with your deployed stack, you must set the `stackName` environment variable for this command, which should match the stack name in Cloudformation for your app deployment. (default: `prefix` in config.yml)

### Config

Includes the Kes configuration files needed for the deployment of the Api:

- `config/lambdas.yml`: Includes that Lambdas that do internal Api related tasks such as listening to SNS events or consuming SQS queues
- `config/api_v1.yml`: Includes all the Api endpoints and is versioned. Future versions of the Api should duplicate and rename this file
- `config/distribution.yml`: Includes config needed for the distribution endpoint that handles file downloads with EarthLogin

## Command Line Interface

A command line interface is available to provide some additional API functionality. To see the available commands, install the Cumulus API package and run `cumulus-api --help`.

### Reindexing Elasticsearch Indices

Reindexing is available via the command line tool. Cumulus uses [index aliases](https://www.elastic.co/guide/en/elasticsearch/reference/current/indices-aliases.html) to allow reindexing with no downtime. When using the reindex functionality, a new index will be created and all of the data will be indexed to the new index. When the operation is complete, the user can choose to switch to using the new index and delete the old index after verifying the new index.

The Elasticsearch commands require a host to be specified. Your host can be found in AWS by going to the Elasticsearch Service and choosing your domain. The endpoint is the host. You can view your indices here as well on the indices tab.

#### Reindex

The reindex command creates a new index and reindexes the source index to the new, destination index.

An alias should not be specified unless you have a specific alias configured. If a source index is not specified, it will default to the index from the alias. If you want to name the destination index something particular, you can specify a name, otherwise the destination index name will default to 'cumulus-year-month-day' with today's date.

```bash
cumulus-api reindex --help

  Usage: reindex [options]

  Reindex elasticsearch index to a new destination index

  Options:

    -a, --index-alias <indexAlias>    AWS Elasticsearch index alias (default: cumulus-alias)
    --host <host>                     AWS Elasticsearch host (default: null)
    -s, --source-index <sourceIndex>  Index to reindex (default: null)
    -d, --dest-index <destIndex>      Name of the destination index, should not be an existing index. Will default to an index named with today's date (default: null)
    -h, --help                        output usage information
```

#### Get Status

Retrieves the status of the Elasticsearch reindex tasks. If empty, there are no running tasks and reindexing is complete.

```bash
cumulus-api status --help

  Usage: status [options]

  Get the status of the reindex tasks for the given host

  Options:

    --host <host>  AWS Elasticsearch host (default: null)
    -h, --help     output usage information
```

#### Complete Reindex

When the reindexing operation is complete, you can choose to switch your Cumulus deployment to use the new index. Specify a source index and destination index. You can find both of these in AWS, our output from your reindex command.

```bash
cumulus-api complete-reindex --help

  Usage: complete-reindex [options]

  Switch to using the new index (destination index) instead of the source index.

  Options:

    -a, --index-alias <indexAlias>    AWS Elasticsearch index alias (default: cumulus-alias)
    --host <host>                     AWS Elasticsearch host (default: null)
    -s, --source-index <sourceIndex>  Index to switch from and no longer used (default: null)
    -d, --dest-index <destIndex>      Index to be aliased and used as the elasticsearch index for Cumulus (default: null)
    -h, --help                        output usage information
```

## What is Cumulus?

Cumulus is a cloud-based data ingest, archive, distribution and management prototype for NASA's future Earth science data streams.

[Cumulus Documentation](https://nasa.github.io/cumulus)

## Contributing

See [Cumulus README](https://github.com/nasa/cumulus/blob/master/README.md#installing-and-deploying)

## Running Tests

Running tests for message-consumer depends on localstack. Once you have installed localstack, start it:

```bash
localstack start
```

Then you can run tests locally via:

```bash
LOCALSTACK_HOST=localhost IS_LOCAL=true npm run test
```
