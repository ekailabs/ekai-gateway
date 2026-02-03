import { Request, Response } from 'express';
import { dbQueries } from '../../infrastructure/db/queries.js';
import { logger } from '../../infrastructure/utils/logger.js';
import { ValidationError } from '../../shared/errors/index.js';
import { filterValidModels, filterAccessibleModels } from '../../domain/services/access-service.js';

/**
 * GET /user/preferences
 * Returns the authenticated user's preferences.
 * If no preferences exist, returns defaults (api_address = own address, no model_preferences).
 */
export async function handleGetPreferences(req: Request, res: Response): Promise<void> {
  try {
    const address = req.user?.address;
    if (!address) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const prefs = dbQueries.getUserPreferences(address);

    if (prefs) {
      res.json({
        address: prefs.address,
        api_address: prefs.api_address,
        model_preferences: prefs.model_preferences,
        updated_at: prefs.updated_at
      });
    } else {
      // Return defaults if no preferences set
      res.json({
        address,
        api_address: address,
        model_preferences: null,
        updated_at: null
      });
    }

    logger.debug('User preferences retrieved', {
      address,
      requestId: req.requestId,
      module: 'preferences-handler'
    });
  } catch (error) {
    logger.error('Failed to get user preferences', error, {
      requestId: req.requestId,
      module: 'preferences-handler'
    });
    res.status(500).json({ error: 'Failed to retrieve preferences' });
  }
}

/**
 * PUT /user/preferences
 * Updates the authenticated user's preferences.
 * Body: { api_address?: string, model_preferences?: string[] | null }
 */
export async function handleUpdatePreferences(req: Request, res: Response): Promise<void> {
  try {
    const address = req.user?.address;
    if (!address) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { api_address, model_preferences } = req.body;

    // Validate api_address if provided
    if (api_address !== undefined && typeof api_address !== 'string') {
      throw new ValidationError('api_address must be a string');
    }

    // Validate model_preferences if provided
    if (model_preferences !== undefined && model_preferences !== null) {
      if (!Array.isArray(model_preferences)) {
        throw new ValidationError('model_preferences must be an array of strings or null');
      }
      if (!model_preferences.every(m => typeof m === 'string')) {
        throw new ValidationError('model_preferences must contain only strings');
      }
      if (model_preferences.length === 0) {
        throw new ValidationError('model_preferences cannot be empty. Provide at least one model or set to null.');
      }

      // Validate that all models exist in catalog
      const { valid, invalid } = filterValidModels(model_preferences);
      if (invalid.length > 0) {
        throw new ValidationError(`Invalid models: ${invalid.join(', ')}. These models do not exist in the catalog.`);
      }

      // Check access to models (provider API keys available)
      const apiOwner = api_address ?? dbQueries.getUserPreferences(address)?.api_address ?? address;
      const accessible = filterAccessibleModels(address, apiOwner, valid);
      const inaccessible = valid.filter(m => !accessible.includes(m));
      if (inaccessible.length > 0) {
        throw new ValidationError(`No access to models: ${inaccessible.join(', ')}. Provider API keys may not be configured.`);
      }
    }

    // Get existing preferences or use defaults
    const existing = dbQueries.getUserPreferences(address);
    const newApiAddress = api_address ?? existing?.api_address ?? address;
    const newModelPreferences = model_preferences !== undefined ? model_preferences : (existing?.model_preferences ?? null);

    const updated = dbQueries.upsertUserPreferences(address, newApiAddress, newModelPreferences);

    res.json({
      address: updated.address,
      api_address: updated.api_address,
      model_preferences: updated.model_preferences,
      updated_at: updated.updated_at
    });

    logger.info('User preferences updated', {
      address,
      api_address: newApiAddress,
      model_preferences: newModelPreferences,
      requestId: req.requestId,
      module: 'preferences-handler'
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      res.status(400).json({ error: error.message });
      return;
    }
    logger.error('Failed to update user preferences', error, {
      requestId: req.requestId,
      module: 'preferences-handler'
    });
    res.status(500).json({ error: 'Failed to update preferences' });
  }
}
