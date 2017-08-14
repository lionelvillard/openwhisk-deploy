/*
 * Copyright 2017 IBM Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
const request = require('request-promise')
const archiver = require('archiver')
const fs = require('fs')


// Check manifest is present, otherwise fetch it.
function assignManifest(args) {
    if (args.hasOwnProperty('manifest')) {
        return Promise.resolve(args)
    }

    // No manifest: need a repo.
    if (!haveRepo(args))
        return Promise.reject(`Missing repository properties ('owner', 'repo', and 'sha')`)

    return fetchContent(args, 'manifest.yaml')
        .then(manifest => {
            args.manifest = manifest
            return args
        })
}
exports.assignManifest = assignManifest

// Fetch file content in GitHubRepository
function fetchContent(args, location) {
    if (!haveRepo(args))
        return Promise.reject(`Missing repository properties ('owner', 'repo', and 'sha') needed to get ${location}`)

    return request({
        uri: `https://raw.githubusercontent.com/${args.owner}/${args.repo}/${args.sha}/${location}`
    }).then(result => {
        console.log(`fetched ${location}`)
        return result
    })
}
exports.fetchContent = fetchContent

//
function haveRepo(args) {
    return args.hasOwnProperty('assets') && args.assets.hasOwnProperty('conf') &&
        args.assets.conf.hasOwnProperty('owner') && args.assets.conf.hasOwnProperty('repo') &&
        args.assets.conf.hasOwnProperty('sha')
}
exports.haveRepo = haveRepo

const makeZip = (targetZip, src) => new Promise((resolve, reject) => {
    const output = fs.createWriteStream(targetZip)
    const archive = archiver('zip', {
        zlib: {level: 9}
    })

    output.on('close', () => {
        resolve()
    })

    archive.on('error', err => {
        reject(err)
    })

    // pipe archive data to the file
    archive.pipe(output)

    // append files from src directory
    archive.directory(src, '.')

    // finalize the archive (ie we are done appending files but streams have to finish yet)
    archive.finalize()
})
exports.zip = makeZip

// Assign the source properties to target. Throw an exception when a conflict occurs.
const mergeObjects = (target, source) => {
    if (source) {
        for (const key of Object.keys(source)) {
            if (target.hasOwnProperty(key))
                throw new Error(`Duplicate key ${key}`)
            target[key] = source[key]
        }
    }
    return target
}
exports.mergeObjects = mergeObjects

// Initialize action with the `baseAction` properties
const initFromBaseAction = baseAction => {
    const action = {}
    if (baseAction.limits)
        action.limits = baseAction.limits
    if (baseAction.annotations)
        action.annotations = baseAction.annotations
    if (baseAction.inputs)
        action.inputs = baseAction.inputs

    return action
}
exports.initFromBaseAction = initFromBaseAction