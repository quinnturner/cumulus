'use strict';

const got = require('got');
const get = require('lodash.get');
const publicIp = require('public-ip');
const pRetry = require('p-retry');
const Logger = require('@cumulus/logger');

const searchConcept = require('./searchConcept');
const ingestConcept = require('./ingestConcept');
const deleteConcept = require('./deleteConcept');
const getUrl = require('./getUrl');
const ValidationError = require('./ValidationError');

const log = new Logger({ sender: 'cmr-client' });

const logDetails = {
  file: 'cmr-client/CMR.js'
};

const IP_TIMEOUT_MS = 1 * 1000;

/**
 * Find the UMM version as a decimal string.
 * If a version cannot be found on the input object
 * version 1.4 is assumed and returned.
 *
 * @param {Object} umm - UMM metadata object
 * @returns {string} UMM version for the given object
 *
 * @private
 */
function ummVersion(umm) {
  return get(umm, 'MetadataSpecification.Version', '1.4');
}

/**
 * Posts a given xml string to the validate endpoint of CMR
 * and promises true if valid.
 *
 * @param {string} ummMetadata - the UMM object
 * @param {string} identifier - the document identifier
 * @param {string} provider - the CMR provider
 * @returns {Promise<boolean>} returns true if the document is valid
 *
 * @private
 */
async function validateUMMG(ummMetadata, identifier, provider) {
  const version = ummVersion(ummMetadata);
  let result;

  try {
    result = await got.post(`${getUrl('validate', provider)}granule/${identifier}`, {
      json: true,
      body: ummMetadata,
      headers: {
        Accept: 'application/json',
        'Content-type': `application/vnd.nasa.cmr.umm+json;version=${version}`
      }
    });

    if (result.statusCode === 200) {
      return true;
    }
  } catch (e) {
    result = e.response;
  }

  throw new ValidationError(
    `Validation was not successful. UMM metadata Object: ${JSON.stringify(ummMetadata)}`
  );
}

const retrieveCmrToken = async (tokenParams) => {
  try {
    return await got.post(
      getUrl('token'),
      {
        json: true,
        body: { token: tokenParams }
      }
    );
  } catch (err) {
    log.error(`Failed to update token: ${JSON.stringify(err)}`);

    throw err;
  }
};

const getClientIp = () =>
  publicIp.v4({ timeout: IP_TIMEOUT_MS })
    .catch(() => '127.0.0.1');

/**
 * Returns a valid a CMR token
 *
 * @param {string} cmrProvider - the CMR provider id
 * @param {string} clientId - the CMR clientId
 * @param {string} username - CMR username
 * @param {string} password - CMR password
 * @returns {Promise.<string>} the token
 *
 * @private
 */
async function updateToken(cmrProvider, clientId, username, password) {
  if (!cmrProvider) throw new Error('cmrProvider is required.');
  if (!clientId) throw new Error('clientId is required.');
  if (!username) throw new Error('username is required.');
  if (!password) throw new Error('password is required.');

  const tokenParams = {
    username,
    password,
    client_id: clientId,
    user_ip_address: await getClientIp(),
    provider: cmrProvider
  };

  // Update the saved ECHO token
  // for info on how to add collections to CMR: https://cmr.earthdata.nasa.gov/ingest/site/ingest_api_docs.html#validate-collection
  const response = await pRetry(
    () => retrieveCmrToken(tokenParams),
    { retries: 3 }
  );

  const tokenId = get(response, 'body.token.id');

  if (!tokenId) throw new Error('Authentication with CMR failed');

  return tokenId;
}

/**
 * A class to simplify requests to the CMR
 *
 * @typicalname cmrClient
 *
 * @example
 * const { CMR } = require('@cumulus/cmr-client');
 *
 * const cmrClient = new CMR({
 *  provider: 'my-provider',
 *  clientId: 'my-clientId',
 *  username: 'my-username',
 *  password: 'my-password'
 * });
 */
class CMR {
  /**
   * The constructor for the CMR class
   *
   * @param {Object} params
   * @param {string} params.provider - the CMR provider id
   * @param {string} params.clientId - the CMR clientId
   * @param {string} params.username - CMR username
   * @param {string} params.password - CMR password
   */
  constructor(params = {}) {
    this.clientId = params.clientId;
    this.provider = params.provider;
    this.username = params.username;
    this.password = params.password;
  }

  /**
   * The method for getting the token
   *
   * @returns {Promise.<string>} the token
   */
  getToken() {
    return updateToken(this.provider, this.clientId, this.username, this.password);
  }

  /**
   * Return object containing CMR request headers
   *
   * @param {Object} params
   * @param {string} [params.token] - CMR request token
   * @param {string} [params.ummgVersion] - UMMG metadata version string or null if echo10 metadata
   * @returns {Object} CMR headers object
   */
  getHeaders(params = {}) {
    const contentType = params.ummgVersion
      ? `application/vnd.nasa.cmr.umm+json;version=${params.ummgVersion}`
      : 'application/echo10+xml';

    const headers = {
      'Client-Id': this.clientId,
      'Content-type': contentType
    };

    if (params.token) headers['Echo-Token'] = params.token;
    if (params.ummgVersion) headers.Accept = 'application/json';

    return headers;
  }

  /**
   * Adds a collection record to the CMR
   *
   * @param {string} xml - the collection XML document
   * @returns {Promise.<Object>} the CMR response
   */
  async ingestCollection(xml) {
    const headers = this.getHeaders({ token: await this.getToken() });
    return ingestConcept('collection', xml, 'Collection.DataSetId', this.provider, headers);
  }

  /**
   * Adds a granule record to the CMR
   *
   * @param {string} xml - the granule XML document
   * @returns {Promise.<Object>} the CMR response
   */
  async ingestGranule(xml) {
    const headers = this.getHeaders({ token: await this.getToken() });
    return ingestConcept('granule', xml, 'Granule.GranuleUR', this.provider, headers);
  }

  /**
   * Adds/Updates UMMG json metadata in the CMR
   *
   * @param {Object} ummgMetadata - UMMG metadata object
   * @returns {Promise<Object>} to the CMR response object.
   */
  async ingestUMMGranule(ummgMetadata) {
    const headers = this.getHeaders({
      token: await this.getToken(),
      ummgVersion: ummVersion(ummgMetadata)
    });

    const granuleId = ummgMetadata.GranuleUR || 'no GranuleId found on input metadata';
    logDetails.granuleId = granuleId;

    let response;
    try {
      await validateUMMG(ummgMetadata, granuleId, this.provider);

      response = await got.put(
        `${getUrl('ingest', this.provider)}granules/${granuleId}`,
        {
          json: true,
          body: ummgMetadata,
          headers
        }
      );
      if (response.body.errors) {
        throw new Error(`Failed to ingest, CMR Errors: ${response.errors}`);
      }
    } catch (error) {
      log.error(error, logDetails);
      throw error;
    }

    return response.body;
  }

  /**
   * Deletes a collection record from the CMR
   *
   * @param {string} datasetID - the collection unique id
   * @returns {Promise.<Object>} the CMR response
   */
  async deleteCollection(datasetID) {
    const headers = this.getHeaders({ token: await this.getToken() });
    return deleteConcept('collection', datasetID, headers);
  }

  /**
   * Deletes a granule record from the CMR
   *
   * @param {string} granuleUR - the granule unique id
   * @returns {Promise.<Object>} the CMR response
   */
  async deleteGranule(granuleUR) {
    const headers = this.getHeaders({ token: await this.getToken() });
    return deleteConcept('granules', granuleUR, this.provider, headers);
  }

  /**
   * Search in collections
   *
   * @param {string} params - the search parameters
   * @param {string} [format=json] - format of the response
   * @returns {Promise.<Object>} the CMR response
   */
  async searchCollections(params, format = 'json') {
    const searchParams = Object.assign({}, { provider_short_name: this.provider }, params);
    return searchConcept({
      type: 'collections',
      searchParams,
      previousResults: [],
      headers: { 'Client-Id': this.clientId },
      format
    });
  }

  /**
   * Search in granules
   *
   * @param {string} params - the search parameters
   * @param {string} [format='json'] - format of the response
   * @returns {Promise.<Object>} the CMR response
   */
  async searchGranules(params, format = 'json') {
    const searchParams = Object.assign({}, { provider_short_name: this.provider }, params);
    return searchConcept({
      type: 'granules',
      searchParams,
      previousResults: [],
      headers: { 'Client-Id': this.clientId },
      format
    });
  }
}
module.exports = CMR;
