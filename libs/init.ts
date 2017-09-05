/*
 * Copyright 2017 IBM Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the "License")
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
import { Logger, getLogger } from 'log4js';
import * as fs from 'fs-extra';
import * as yaml from 'yamljs';
import * as path from 'path';

const fakeow = require('./fakeow');
const plugins = require('./pluginmgr');

type YAML = any;

type Loader = (string) => Promise<Buffer>;

interface Config {
    ow?: any;                       // OpenWhisk client. Perform a dry-run if not provided.

    manifest?: YAML | string;       // manifest used for deployment. Parsed or unparsed.
    location?: string;              // manifest location. Ignored if manifest is provided

    cache?: string;                 // cache location
    force?: boolean;                // perform update operation when true. Default is 'false'

    logger_level?: string;          // logger level ('ALL', 'FATAL', 'ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE', 'OFF')
    logger?: Logger;                // logger

    load?: Loader;
    basePath?: string;
}

export async function init(ow: any, config: Config) {
    if (!config.logger)
        config.logger = getLogger();

    config.logger_level = config.logger_level || 'off';
    config.logger.setLevel(config.logger_level);

    if (!ow)
        ow = fakeow;

    async function load(location: string) {
        config.logger.debug(`read local file ${location}`);
        const content = await fs.readFile(location);
        return content;
    };

    if (!config.load)
        config.load = load;

    if (!config.force) {
        ow.packages.change = ow.packages.create;
        ow.triggers.change = ow.triggers.create;
        ow.routes.change = ow.routes.create;
        ow.actions.change = ow.actions.create;
        ow.feeds.change = ow.feeds.create;
        ow.rules.change = ow.rules.create;
    } else {
        ow.packages.change = ow.packages.update;
        ow.triggers.change = ow.triggers.update;
        ow.routes.change = ow.routes.update;
        ow.actions.change = ow.actions.update;
        ow.feeds.change = ow.feeds.update;
        ow.rules.change = ow.rules.update;
    }
    config.ow = ow;
    
    await resolveManifest(config);
    await configCache(config);
    await plugins.init(config);
}


async function resolveManifest(config: Config) {
    if (config.manifest || config.manifest === '') {
        if (typeof config.manifest === 'string') {
            config.manifest = yaml.parse(config.manifest) || {};
        }
        config.basePath = config.basePath || process.cwd();
        return;
    }

    if (config.location) {
        config.location = path.resolve(config.basePath || process.cwd(), config.location);
        config.basePath = path.parse(config.location).dir;

        await loadManifest(config);
        return;
    }

    throw 'No valid manifest found';
}

async function loadManifest(config: Config) {
    const content = await config.load(config.location);
    config.manifest = yaml.parse(Buffer.from(content).toString());
}

async function configCache(config: Config) {
    if (!config.cache) {
        config.cache = `${config.basePath}/.openwhisk`
        await fs.mkdirs(config.cache) // async since using fs-extra
    }
}