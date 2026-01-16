import { dbQueries } from '../../infrastructure/db/queries.js';
import { logger } from '../../infrastructure/utils/logger.js';
import { BudgetExceededError } from '../../shared/errors/gateway-errors.js';

export interface BudgetStatus {
  limit: number | null;
  alertOnly: boolean;
  spent: number;
  remaining: number | null;
  window: 'monthly';
  allowed: boolean;
}

export class BudgetService {
  private getCurrentWindow(): { start: string; end: string } {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
    return { start: start.toISOString(), end: now.toISOString() };
  }

  getBudgetStatus(estimatedCost: number = 0): BudgetStatus {
    const limitRecord = dbQueries.getGlobalSpendLimit();
    const { start, end } = this.getCurrentWindow();
    const spent = dbQueries.getTotalCost(start, end);

    const limit = limitRecord?.amount_usd ?? null;
    const alertOnly = Boolean(limitRecord?.alert_only);
    const remaining = limit === null ? null : Math.max(0, limit - spent);
    const allowed = limit === null ? true : spent + Math.max(estimatedCost, 0) <= limit;

    return {
      limit,
      alertOnly,
      spent,
      remaining,
      window: 'monthly',
      allowed
    };
  }

  enforceBudget(estimatedCost: number = 0, requestId?: string): BudgetStatus {
    const status = this.getBudgetStatus(estimatedCost);

    if (!status.allowed && !status.alertOnly) {
      logger.warn('Request blocked by global budget', {
        requestId,
        spent: status.spent,
        limit: status.limit,
        estimatedCost,
        window: status.window,
        module: 'budget-service'
      });
      throw new BudgetExceededError('Global monthly budget exceeded', {
        spent: status.spent,
        limit: status.limit,
        window: status.window
      });
    }

    if (!status.allowed && status.alertOnly) {
      logger.warn('Global budget exceeded (alert-only)', {
        requestId,
        spent: status.spent,
        limit: status.limit,
        estimatedCost,
        window: status.window,
        module: 'budget-service'
      });
    }

    return status;
  }

  upsertBudget(amountUsd: number | null, alertOnly: boolean): BudgetStatus {
    dbQueries.upsertGlobalSpendLimit(amountUsd, alertOnly);
    const status = this.getBudgetStatus();
    logger.info('Global budget updated', {
      amountUsd,
      alertOnly,
      window: status.window,
      module: 'budget-service'
    });
    return status;
  }
}

export const budgetService = new BudgetService();
