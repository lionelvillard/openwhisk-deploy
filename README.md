[![Build Status](https://travis-ci.org/lionelvillard/openwhisk-project.svg?branch=master)](https://travis-ci.org/lionelvillard/openwhisk-project) [![Dependencies](https://david-dm.org/lionelvillard/openwhisk-project.svg)](https://david-dm.org/lionelvillard/openwhisk-project)

This project provides a set of tools for managing a collection of OpenWhisk entities and related services (eg. Cloudant, Redis, etc...).      
 
# Getting started

```bash
$ npm install openwhisk-deploy --save
```

# Main Features

- deploy: deploy a set of OpenWhisk entities and services from description stored in [project configuration files](docs/format.md).
- undeploy: undeploy a set of managed OpenWhisk entities and managed services.
- clean: remove *all* deployed entities in a namespace. Services are left untouched.
- refresh: update the local deployment configuration files against deployed entities.
- sync: update the local deployment configuration files against files stored locally.

# Example

```yaml

# try-catch combinator example
packages:
  plugin-combinator-1:
    actions:
      safeToDelete:
        kind: nodejs
        code: |
          function main(params) {
            if (params.delete)
              return {}
            throw new Error('Oh No!')
          } 
      delete:
        kind: nodejs
        code: |
          function main(params) {
            delete params[params.delete]
            return params
          }

      handleError:
        kind: nodejs
        code: |
          function main(params) {
            return {status: 'Um a very bad thing just happened - sorry?'}
          }
          
      trycatch:
        combinator: try safeToDelete catch handleError

      eca:
        combinator: if safeToDelete then delete

      forward:
        combinator: forward ["authkey"] after safeToDelete with ["delete"]
        inputs:
          authkey: very private
          delete: something

      retry:
        combinator: retry delete 5 times
```

# Deployment format specification

See [specification](docs/format.md)

# Development

```bash
$ git clone https://github.com/lionelvillard/openwhisk-project.git
$ cd openwhisk-project
$ npm i
```

To run the tests, it is recommended to create the file `.wskprops` in the project root directory. Then do:

```bash
$ npm test
```
