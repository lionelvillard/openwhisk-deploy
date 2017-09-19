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
const fs = require('fs-extra')
const openwhisk = require('openwhisk')
const expandHomeDir = require('expand-home-dir')
const path = require('path')

export const getWskPropsFile = () => {
    let wskprops = process.env.WSK_CONFIG_FILE
    if (!wskprops || !fs.existsSync(wskprops)) {
        const until = path.dirname(expandHomeDir('~'))
        let current = process.cwd()
        while (current !== '/' && current !== until) {
            wskprops = path.join(current, '.wskprops')

            if (fs.existsSync(wskprops))
                break
            current = path.dirname(current)
        }
    }
    return wskprops
}

export const readWskProps = () => {
    const wskprops = getWskPropsFile()
    if (wskprops) {
        const propertiesParser = require('properties-parser')
        try {
            return propertiesParser.read(wskprops)
        } catch (e) {
            return null
        }
    }
    return null
}

export const auth = (options : any = {}) => {
    if (options.auth)
        return options

    const wskprops = readWskProps()

    if (wskprops) {
        return {
            api_key: wskprops.AUTH,
            apihost: wskprops.APIHOST,
            ignore_certs: wskprops.IGNORE_CERTS || false,
            apigw_token: wskprops.APIGW_ACCESS_TOKEN
        }
    }

    return null
} 

// Resolve variables by merging command line options with .wskprops content
export const resolveVariables = (options: any = {}) => {
    const wskprops = readWskProps() || {}
    const variables: any = {}

    variables.auth = options.auth || process.env.WHISK_AUTH || wskprops.AUTH 
    variables.apihost = options.apihost || process.env.WHISK_APIHOST || wskprops.APIHOST 
    variables.ignore_certs = options.ignore_certs || process.env.WHISK_IGNORE_CERTS || wskprops.IGNORE_CERTS || false
    variables.apigw_token = options.apigw_token || process.env.WHISK_APIGW_ACCESS_TOKEN || wskprops.APIGW_ACCESS_TOKEN

    return variables
}

export const initWsk = (options = {}) => {
    const vars = resolveVariables(options);
    return openwhisk({ api_key: vars.auth, apihost: vars.apihost, ignore_certs: vars.ignore_certs, apigw_token: vars.apigw_token })
}