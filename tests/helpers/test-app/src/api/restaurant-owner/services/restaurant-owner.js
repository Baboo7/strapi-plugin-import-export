'use strict';

/**
 * restaurant-owner service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::restaurant-owner.restaurant-owner');
