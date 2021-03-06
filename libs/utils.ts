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
import * as request from 'request-promise';
import { IConfig, IProject } from './types';
import * as path from 'path';
import * as fs from 'fs-extra';
import { parse } from 'url';
import * as simpleGit from 'simple-git/promise';

// Assign the source properties to target. Throw an exception when a conflict occurs.
export const mergeObjects = (target, source) => {
    if (source) {
        for (const key of Object.keys(source)) {
            if (target.hasOwnProperty(key))
                throw new Error(`Duplicate key ${key}`);
            target[key] = source[key];
        }
    }
    return target;
};

// Initialize action with the `baseAction` properties
export const initFromBaseAction = baseAction => {
    const action: any = {};
    if (baseAction.limits)
        action.limits = baseAction.limits;
    if (baseAction.annotations)
        action.annotations = baseAction.annotations;
    if (baseAction.inputs)
        action.inputs = baseAction.inputs;

    return action;
};

// --- Conversion functions from manifest format to rest params

export const getAnnotations = (config, annotations): any => {
    const converted = getKeyValues(annotations);
    if (config.manifest.name) {
        converted.push({ key: 'managed', value: config.manifest.name });
    }
    return converted;
};

export const getKeyValues = inputs => {
    if (inputs) {
        return Object.keys(inputs).map(key => ({ key, value: inputs[key] }));
    }
    return [];
};

export const indexKeyValues = kvs => {
    const index = {};
    if (kvs) {
        kvs.forEach(kv => index[kv.key] = kv.value);
    }
    return index;
};

// TODO: support ${} format
const resolveValue = (value, args) => {
    if (typeof value === 'string' && value.startsWith('$')) {
        const key = value.substr(1);
        if (args.env && args.env[key])
            return args.env[key];

        return process.env[key];
    }
    return value;
};

// --- low level deployment functions

export const deployRawAction = (ctx, actionName, action) => {
    ctx.logger.info(`deploying ${actionName}`);
    ctx.logger.trace(JSON.stringify(action));
    return ctx.ow.actions.change({
        actionName,
        action
    }).then(r => {
        if (r.exec) delete r.exec.code;
        ctx.logger.info(`deployed ${JSON.stringify(r)}`);
    });
};

// --- OpenWhisk client introspection

export function getAPIHost(config: IConfig) {
    if (config.ow && config.ow.actions && config.ow.actions.client) {
        return config.ow.actions.client.options.api;
    }
    return null;
}

// --- Helper functions managing openwhisk configuration files

/*
  Get the object represented by the path. Create missing intermediate values.
  The path syntax is:
  - '.name': select the object 'name'. Create if it does not exist
  - '.name[]': append an object in the array 'name'.
*/
export function getObject(project: IProject, path: string, create = false) {
    let current: any = project;
    const segments = path.split('.');
    for (const segment of segments) {
        const array = segment.endsWith('[]');
        const name = array ? segment.substr(0, segment.length - 2) : segment;
        if (!current.hasOwnProperty(name)) {
            if (!create)
                return null;

            current[name] = array ? [] : {};
        }
        current = current[name];
        if (array) {
            const obj = {};
            current.push(obj);
            current = obj;
        }
    }
    return current;
}

export const getPackage = (manifest, packageName, create = false) => {
    let pkgCfg;
    if (packageName) {
        let pkgsCfg = manifest.packages;
        if (!pkgsCfg) {
            if (!create)
                return null;

            pkgsCfg = manifest.packages = {};
        }
        pkgCfg = pkgsCfg[packageName];
        if (!pkgCfg) {
            if (!create)
                return null;

            pkgCfg = manifest.packages[packageName] = {};
        }
    } else {
        pkgCfg = manifest;
    }
    return pkgCfg;
};

export const getAction = (manifest, packageName, actionName, create = false) => {
    const pkgCfg = getPackage(manifest, packageName, create);
    if (!pkgCfg)
        return null;

    let actionsCfg = pkgCfg.actions;
    if (!actionsCfg) {
        if (!create)
            return null;
        actionsCfg = pkgCfg.actions = {};
    }
    let actionCfg = actionsCfg[actionName];
    if (!actionCfg) {
        if (!create)
            return null;

        actionCfg = actionsCfg[actionName] = {};
    }
    return actionCfg;
};

export const getTrigger = (manifest, triggerName, create = false) => {
    let triggersCfg = manifest.triggers;
    if (!triggersCfg) {
        if (!create)
            return null;
        triggersCfg = manifest.triggers = {};
    }
    let triggerCfg = triggersCfg[triggerName];
    if (!triggerCfg) {
        if (!create)
            return null;

        triggerCfg = triggersCfg[triggerName] = {};
    }
    return triggerCfg;
};

export const getRule = (manifest, ruleName, create = false) => {
    let rulesCfg = manifest.rules;
    if (!rulesCfg) {
        if (!create)
            return null;
        rulesCfg = manifest.rules = {};
    }
    let ruleCfg = rulesCfg[ruleName];
    if (!ruleCfg) {
        if (!create)
            return null;

        ruleCfg = rulesCfg[ruleName] = {};
    }
    return ruleCfg;
};

export const getApi = (manifest, apiName, create = false) => {
    // TODO: currently treat apiname as being basePath
    let apisCfg = manifest.apis;
    if (!apisCfg) {
        if (!create)
            return null;
        apisCfg = manifest.apis = {};
    }
    let apiCfg = apisCfg[apiName];
    if (!apiCfg) {
        if (!create)
            return null;

        apiCfg = apisCfg[apiName] = {};
    }
    return apiCfg;
};

// --- Git

// Clone or update git repository into local cache. Also checkout a tag/revision/branch
// Support repo subdirectory specified after repo.git/[subdir][#<tag/revision/branch>]
export async function gitClone(config: IConfig, location: string) {
    const gitIdx = location.indexOf('.git');
    if (gitIdx === -1)
        config.fatal('Malformed git repository %s (missing .git)', location);

    let localDir;
    let repo = location.substring(0, gitIdx + 4);
    if (repo.startsWith('ssh://')) {
        repo = repo.substr(6);
        // must be of the form git@<hostname>:<user>/<repository>.git

        const matched = repo.match(/^git@([^:]+):([^\/]+)\/(.+)\.git$/);
        if (!matched)
            config.fatal('Malformed git repository %s', repo);
        localDir = path.join(config.cache, 'git', matched[2], matched[3]);
    } else {
        const parsed = parse(repo);

        const pathIdx = parsed.path.indexOf('.git');
        const srepo = parsed.path.substring(0, pathIdx);
        localDir = path.join(config.cache, 'git', srepo);
    }

    if (await fs.pathExists(localDir)) {
        config.logger.debug(`git fetch ${repo} in ${localDir}`);
        await simpleGit(localDir).fetch(null, null, ['--all']);

    } else {
        await fs.ensureDir(localDir);
        config.logger.debug(`git clone ${repo} in ${localDir}`);
        await simpleGit(localDir).clone(repo, '.');
    }

    const hashIdx = location.indexOf('#');
    if (hashIdx !== -1) {
        const hash = location.substr(hashIdx + 1);
        // TODO: check syntax

        await simpleGit(localDir).checkout(hash);
    }

    let projectFilePath = location.substr(gitIdx + 5);
    if (hashIdx !== -1)
        projectFilePath = projectFilePath.substring(0, projectFilePath.indexOf('#'));

    return path.join(localDir, projectFilePath);
}

export async function addAnnotatedTag(config: IConfig, localgit: string, version: string) {
    return (simpleGit(localgit) as any).addAnnotatedTag(`v${version}`, `Tagging ${config.manifest.name} version ${version}`);
}

export async function getTags(config: IConfig, localgit: string) {
    return simpleGit(localgit).tags();
}

export async function isGitRepo(localgit: string) {
    return (simpleGit(localgit) as any).revparse(['--is-inside-work-tree']);
}

export async function isGitClean(localgit: string) {
    const summary = await simpleGit(localgit).status();
    return summary.files.length === 0;
}

export async function gitCommit(localgit: string, message: string, files: string[] = [], options: any = {}) {
    return (simpleGit(localgit) as any).commit(message, files, options);
}

export async function gitPush(localgit: string) {
    await simpleGit(localgit).push();
}

export async function gitRemotes(localgit: string) {
    return (simpleGit(localgit) as any).getRemotes(true);
}

// Get git URL: assume origin/fetch|push defined
export async function gitURL(localgit: string) {
    const remotes = await gitRemotes(localgit);
    if (remotes) {
        const origin = remotes.find(remote => remote.name === 'origin');
        if (origin && origin.refs) {
            return origin.refs.fetch || origin.refs.push;
        }
    }
    return null;
}

// --- misc

export async function delay(ms) {
    return new Promise(resolve => {
        setTimeout(() => resolve(), ms);
    });
}
