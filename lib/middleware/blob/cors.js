'use strict';

const BbPromise = require('bluebird'),
    AError = require('./../../core/AzuriteError'),
    ErrorCodes = require('./../../core/ErrorCodes'),
    N = require('./../../core/HttpHeaderNames'),
    Operations = require('./../../core/Constants').Operations,
    sm = require('./../../core/blob/StorageManager');

// Performs CORS rule-validation iff CORS is enabled and request header 'origin' is set.
module.exports = (req, res, next) => {
    BbPromise.try(() => {
        const request = req.azuriteRequest;
        sm.getBlobServiceProperties()
            .then((response) => {
                const allowedMethods = req.azuriteOperation === Operations.Account.PREFLIGHT_BLOB_REQUEST
                    ? request.httpProps[N.ACCESS_CONTROL_REQUEST_METHOD].toLowerCase()
                    : req.method.toLowerCase();

                const allowedHeaders = req.azuriteOperation === Operations.Account.PREFLIGHT_BLOB_REQUEST
                    ? request.httpProps[N.ACCESS_CONTROL_REQUEST_HEADERS].toLowerCase().split(',')
                        .reduce((acc, e) => {
                            const key = Object.keys(e)[0];
                            acc[key] = e[key];
                            return acc;
                        }, {})
                    : req.headers;

                if (response.payload.StorageServiceProperties && request.httpProps[N.ORIGIN]) {
                    for (const rule of response.payload.StorageServiceProperties.Cors) {
                        if (!rule.AllowedOrigins.includes(request.httpProps[N.ORIGIN])) {
                            throw new AError(ErrorCodes.CorsForbidden);
                        }

                        if (!rule.AllowedMethods.includes(allowedMethods)) {
                            throw new AError(ErrorCodes.CorsForbidden);
                        }

                        rule.AllowedHeaders.split(',')
                            .forEach((e) => {
                                let valid = false;
                                Object.keys(allowedHeaders).forEach((requestHeader) => {
                                    if (e.charAt(e.length) === '*') {
                                        valid = requestHeader.includes(e.slice(0, -1));
                                    } else {
                                        valid = (e === requestHeader);
                                    }
                                });
                                if (!valid) {
                                    throw new AError(ErrorCodes.CorsForbidden);
                                }
                            });
                    }
                }
                next();
            });
        return;
    }).catch((e) => {
        res.status(e.statusCode || 500).send(e.message);
        if (!e.statusCode) throw e;
    });
}