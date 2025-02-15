'use strict';

const router = require('express-promise-router')();
const aws = require('@cumulus/common/aws');
const { inTestMode } = require('@cumulus/common/test-utils');
const { RecordDoesNotExist } = require('@cumulus/common/errors');
const Search = require('../es/search').Search;
const models = require('../models');

/**
 * List and search pdrs
 *
 * @param {Object} req - express request object
 * @param {Object} res - express response object
 * @returns {Promise<Object>} the promise of express response object
 */
async function list(req, res) {
  const search = new Search({
    queryStringParameters: req.query
  }, 'pdr');
  const result = await search.query();
  return res.send(result);
}

/**
 * get a single PDR
 *
 * @param {Object} req - express request object
 * @param {Object} res - express response object
 * @returns {Promise<Object>} the promise of express response object
 */
async function get(req, res) {
  const pdrName = req.params.pdrName;

  const pdrModel = new models.Pdr();

  try {
    const result = await pdrModel.get({ pdrName });
    return res.send(result);
  } catch (e) {
    if (e instanceof RecordDoesNotExist) {
      return res.boom.notFound(`No record found for ${pdrName}`);
    }
    throw e;
  }
}

const isRecordDoesNotExistError = (e) => e.message.includes('RecordDoesNotExist');

/**
 * delete a given PDR
 *
 * @param {Object} req - express request object
 * @param {Object} res - express response object
 * @returns {Promise<Object>} the promise of express response object
 */
async function del(req, res) {
  const pdrName = req.params.pdrName;

  const pdrS3Key = `${process.env.stackName}/pdrs/${pdrName}`;

  await aws.deleteS3Object(process.env.system_bucket, pdrS3Key);

  const pdrModel = new models.Pdr();

  try {
    await pdrModel.delete({ pdrName });

    if (inTestMode()) {
      const esClient = await Search.es(process.env.ES_HOST);
      const esIndex = process.env.esIndex;
      await esClient.delete({
        id: pdrName,
        index: esIndex,
        type: 'pdr',
        ignore: [404]
      });
    }
  } catch (err) {
    if (!isRecordDoesNotExistError(err)) throw err;
  }

  return res.send({ detail: 'Record deleted' });
}

router.get('/:pdrName', get);
router.get('/', list);
router.delete('/:pdrName', del);

module.exports = router;
