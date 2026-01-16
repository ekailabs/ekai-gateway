import { Request, Response } from 'express';
import { budgetService } from '../../domain/services/budget-service.js';
import { handleError } from '../../infrastructure/utils/error-handler.js';
import { logger } from '../../infrastructure/utils/logger.js';

const serialize = (status: ReturnType<typeof budgetService.getBudgetStatus>) => ({
  amountUsd: status.limit,
  alertOnly: status.alertOnly,
  window: status.window,
  spentMonthToDate: status.spent,
  remaining: status.remaining
});

export class BudgetHandler {
  getBudget(req: Request, res: Response): void {
    try {
      const status = budgetService.getBudgetStatus();
      res.json(serialize(status));
    } catch (error) {
      handleError(error, res);
    }
  }

  updateBudget(req: Request, res: Response): void {
    try {
      const { amountUsd, alertOnly } = req.body ?? {};

      if (amountUsd !== undefined && amountUsd !== null) {
        if (typeof amountUsd !== 'number' || Number.isNaN(amountUsd) || amountUsd < 0) {
          res.status(400).json({ error: 'amountUsd must be a non-negative number or null' });
          return;
        }
      }

      const parsedAmount: number | null = amountUsd === undefined ? null : amountUsd;
      const parsedAlertOnly = alertOnly === undefined ? false : Boolean(alertOnly);

      const status = budgetService.upsertBudget(parsedAmount, parsedAlertOnly);

      logger.info('Budget updated via API', {
        requestId: req.requestId,
        amountUsd: parsedAmount,
        alertOnly: parsedAlertOnly,
        module: 'budget-handler'
      });

      res.json(serialize(status));
    } catch (error) {
      handleError(error, res);
    }
  }
}

const budgetHandler = new BudgetHandler();

export const handleGetBudget = (req: Request, res: Response): void => {
  budgetHandler.getBudget(req, res);
};

export const handleUpdateBudget = (req: Request, res: Response): void => {
  budgetHandler.updateBudget(req, res);
};
