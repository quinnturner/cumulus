'use strict';

const router = require('express-promise-router')();

const log = require('@cumulus/common/log');

const mappings = require('../models/mappings.json');
const { defaultIndexAlias, Search } = require('../es/search');

// const snapshotRepoName = 'cumulus-es-snapshots';

async function createEsSnapshot(req, res) {
  return res.boom.badRequest('Functionality not yet implemented');

  // *** Currently blocked on NGAP ****
  // const esClient = await Search.es();

  //let repository = null;

  // try {
  //   const repository = await esClient.snapshot.getRepository({ repository: snapshotRepoName });
  // }
  // catch (err) {
  //   // Handle repository missing exceptions
  //   if (!err.message.includes('[repository_missing_exception]')) {
  //     throw err;
  //   }

  // TO DO: when permission boundaries are updated
  // repository = await esClient.snapshot.createRepository({
  //   repository: snapshotRepoName,
  //   verify: false,
  //   body: {
  //     type: 's3',
  //     settings: {
  //       bucket: 'lf-internal',
  //       region: 'us-east-1',
  //       role_arn: process.env.ROLE_ARN
  //     }
  //   }
  // });
  // }
}

async function reindex(req, res) {
  let sourceIndex = req.body.sourceIndex;
  let destIndex = req.body.destIndex;
  const aliasName = req.body.aliasName || defaultIndexAlias;

  const esClient = await Search.es();

  const alias = await esClient.indices.getAlias({
    name: aliasName
  });

  // alias keys = index name
  const indices = Object.keys(alias);

  if (!sourceIndex) {
    if (indices.length > 1) {
      // We don't know which index to use as the source, throw error
      return res.boom.badRequest(`Multiple indices found for alias ${aliasName}. Specify source index as one of [${indices.sort().join(', ')}].`);
    }

    sourceIndex = indices[0];
  } else {
    const sourceExists = await esClient.indices.exists({ index: sourceIndex });

    if (!sourceExists) {
      return res.boom.badRequest(`Source index ${sourceIndex} does not exist.`);
    }

    if (indices.includes(sourceIndex) === false) {
      return res.boom.badRequest(`Source index ${sourceIndex} is not aliased with alias ${aliasName}.`);
    }
  }

  if (!destIndex) {
    const date = new Date();
    destIndex = `cumulus-${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  }

  const destExists = await esClient.indices.exists({ index: destIndex });

  if (destExists) {
    return res.boom.badRequest(`Destination index ${destIndex} exists. Please specify an index name that does not exist.`);
  }

  // create destination index
  await esClient.indices.create({
    index: destIndex,
    body: { mappings }
  });

  log.info(`Created destination index ${destIndex}.`);

  // reindex
  esClient.reindex({
    body: {
      source: { index: sourceIndex },
      dest: { index: destIndex }
    }
  });

  const message = `Reindexing to ${destIndex} from ${sourceIndex}. Check the reindex-status endpoint for status.`;

  return res.status(200).send({ message });
}

async function reindexStatus(req, res) {
  const esClient = await Search.es();

  const reindexTaskStatus = await esClient.tasks.list({ actions: ['*reindex'] });

  await esClient.indices.refresh();

  const indexStatus = await esClient.indices.stats({
    metric: 'docs'
  });

  const status = {
    reindexStatus: reindexTaskStatus,
    indexStatus
  };

  return res.send(status);
}

async function changeIndex(req, res) {
  const deleteSource = req.body.deleteSource;
  const aliasName = req.body.aliasName || defaultIndexAlias;
  const currentIndex = req.body.currentIndex;
  const newIndex = req.body.newIndex;

  const esClient = await Search.es();

  if (!currentIndex || !newIndex) {
    return res.boom.badRequest('Please explicity specify a current and new index.');
  }

  if (currentIndex === newIndex) {
    return res.boom.badRequest('The current index cannot be the same as the new index.');
  }

  const currentExists = await esClient.indices.exists({ index: currentIndex });

  if (!currentExists) {
    return res.boom.badRequest(`Current index ${currentIndex} does not exist.`);
  }

  const destExists = await esClient.indices.exists({ index: newIndex });

  if (!destExists) {
    return res.boom.badRequest(`New index ${newIndex} does not exist.`);
  }

  await esClient.indices.updateAliases({
    body: {
      actions: [
        { remove: { index: currentIndex, alias: aliasName } },
        { add: { index: newIndex, alias: aliasName } }
      ]
    }
  }).then(() => {
    log.info(`Removed alias ${aliasName} from index ${currentIndex} and added alias to ${newIndex}`);
  }).catch((err) =>
    res.boom.badRequest(`Error removing alias ${aliasName} from index ${currentIndex} and adding alias to ${newIndex}: ${err}`));

  let message = `Reindex success - alias ${aliasName} now pointing to ${newIndex}`;

  if (deleteSource) {
    await esClient.indices.delete({ index: currentIndex });
    log.info(`Deleted index ${currentIndex}`);
    message = `${message} and index ${currentIndex} deleted`;
  }

  return res.send({ message });
}

// express routes
router.put('/create-snapshot', createEsSnapshot);
router.post('/reindex', reindex);
router.get('/reindex-status', reindexStatus);
router.post('/change-index', changeIndex);

module.exports = router;
