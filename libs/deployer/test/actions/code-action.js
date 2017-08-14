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
const test = require('ava')
const deployer = require('../../deployer')
const extra = require('../helpers/utils')

require('../helpers/setup')(test)

test('action with inlined code', async t => {
    const packageName = 'code-action-1'
    const ow = t.context.bx.ow
    await extra.deletePackage(t, ow, packageName)

    const result = await deployer.deploy(ow, {
        basePath: 'test/actions/fixtures/code-action',
        cache: t.context.tmpdir,
        location: 'manifest.yaml'
    })

    const echo = await ow.actions.invoke({
        actionName: 'code-action-1/echo',
        params: {lines: ['first', 'second']},
        blocking: true
    })
    t.deepEqual(echo.response.result, {lines: ['first', 'second']})

    await extra.deletePackage(t, ow, packageName)
})