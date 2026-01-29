# Scheduled Jobs Module - Deployment Checklist

## Pre-Deployment

### Code Review
- [ ] Review `scheduled-jobs.service.ts` for business logic
- [ ] Review `scheduled-jobs.module.ts` for module configuration
- [ ] Check `app.module.ts` for correct imports
- [ ] Verify all imports are correct and no circular dependencies
- [ ] Run linter: `npm run lint`
- [ ] Check types: `npx tsc --noEmit`

### Testing
- [ ] Run unit tests: `npm run test`
- [ ] Run e2e tests: `npm run test:e2e`
- [ ] Test manually with test transactions
- [ ] Verify logs output correctly
- [ ] Test error scenarios (network failures, invalid data)

### Database
- [ ] Backup production database
- [ ] Verify entities are registered in TypeORM
- [ ] Check database migrations are up to date
- [ ] Verify indexes exist or create them:
  ```sql
  CREATE INDEX idx_transactions_status_created ON transactions(status, created_at);
  CREATE INDEX idx_transactions_user_status ON transactions(user_id, status);
  CREATE INDEX idx_notifications_user_status ON notifications(user_id, status);
  ```
- [ ] Test database connectivity
- [ ] Verify user permissions for scheduled job user

### Configuration
- [ ] [ ] Set `STELLAR_HORIZON_URL` environment variable
- [ ] [ ] Set `STELLAR_NETWORK` environment variable
- [ ] [ ] Verify `DB_*` environment variables
- [ ] [ ] Check `NODE_ENV` is set to 'production' for production deployment
- [ ] [ ] Verify all required environment variables are documented
- [ ] [ ] Create `.env.production` file with all required variables
- [ ] [ ] Never commit `.env.production` to version control
- [ ] [ ] Use secure environment variable management (Vercel, AWS Secrets Manager, etc.)

### Stellar Network
- [ ] [ ] Verify Stellar Horizon API is accessible
- [ ] [ ] Test Stellar API connectivity: `curl https://horizon.stellar.org/`
- [ ] [ ] Check Stellar API rate limits (100 requests/second)
- [ ] [ ] Verify network passphrase matches (PUBLIC or TESTNET)
- [ ] [ ] Test with a real transaction if possible
- [ ] [ ] Monitor Stellar status page: https://status.stellar.org/

### Monitoring & Logging
- [ ] [ ] Configure log aggregation (ELK, Datadog, CloudWatch, etc.)
- [ ] [ ] Set up error tracking (Sentry, Rollbar, etc.)
- [ ] [ ] Create dashboards for key metrics
- [ ] [ ] Set up alerts for:
  - [ ] Job failures
  - [ ] High error rates
  - [ ] Slow job execution
  - [ ] Database connection issues
  - [ ] Stellar API issues
- [ ] [ ] Configure log retention policy
- [ ] [ ] Test alert notifications work
- [ ] [ ] Document on-call procedures

### Scaling & Performance
- [ ] [ ] Run load tests with expected transaction volume
- [ ] [ ] Monitor database query performance
- [ ] [ ] Check memory usage during operation
- [ ] [ ] Verify CPU usage is acceptable
- [ ] [ ] Test with maximum expected concurrent transactions
- [ ] [ ] Measure Stellar API response times
- [ ] [ ] Plan for cron expression adjustments if needed

### Documentation
- [ ] [ ] Update team documentation with module overview
- [ ] [ ] Document custom environment variables
- [ ] [ ] Document monitoring dashboard URLs
- [ ] [ ] Document alert escalation procedures
- [ ] [ ] Document rollback procedures
- [ ] [ ] Create runbook for common issues
- [ ] [ ] Document disaster recovery procedures

## Deployment

### Pre-Deployment Checks
- [ ] [ ] All code is committed and pushed
- [ ] [ ] All tests are passing
- [ ] [ ] Code review completed and approved
- [ ] [ ] No breaking changes to existing APIs
- [ ] [ ] Database is backed up
- [ ] [ ] Team is notified of deployment
- [ ] [ ] Maintenance window scheduled (if needed)

### Deployment Steps
1. [ ] Build the application: `npm run build`
2. [ ] Verify build completes without errors
3. [ ] Run migrations if any: `npm run migration:run`
4. [ ] Deploy to staging environment
5. [ ] Run smoke tests on staging
6. [ ] Deploy to production
7. [ ] Verify application starts: `npm run start:prod`
8. [ ] Check logs for any startup errors
9. [ ] Verify scheduled jobs are running

### Post-Deployment Verification
- [ ] [ ] Application is running without errors
- [ ] [ ] Logs show successful job execution
- [ ] [ ] Create test transaction and verify reconciliation
- [ ] [ ] Check that notifications are created
- [ ] [ ] Verify balance updates are working
- [ ] [ ] Monitor error rates (should be minimal)
- [ ] [ ] Check database disk usage
- [ ] [ ] Verify Stellar API connectivity
- [ ] [ ] Test failure scenarios if possible

### Monitoring (First 24 Hours)
- [ ] [ ] Check application logs every hour
- [ ] [ ] Monitor scheduled job execution times
- [ ] [ ] Watch for any error spikes
- [ ] [ ] Verify notifications are being sent
- [ ] [ ] Check database growth rate
- [ ] [ ] Monitor CPU and memory usage
- [ ] [ ] Check disk I/O operations
- [ ] [ ] Verify Stellar API connectivity remains stable

## Post-Deployment

### First Week
- [ ] [ ] Daily log reviews
- [ ] [ ] Monitor metrics dashboards
- [ ] [ ] Check user feedback/support tickets
- [ ] [ ] Verify no data consistency issues
- [ ] [ ] Test with real transactions
- [ ] [ ] Load test results match expectations
- [ ] [ ] Database performance remains acceptable
- [ ] [ ] All alerts configured and functioning

### First Month
- [ ] [ ] Complete documentation review
- [ ] [ ] Performance baseline established
- [ ] [ ] Archive initial monitoring data
- [ ] [ ] Plan for scheduled maintenance
- [ ] [ ] Review and adjust cron schedules if needed
- [ ] [ ] Optimize database queries if needed
- [ ] [ ] Conduct team training/knowledge transfer
- [ ] [ ] Plan for scalability if transaction volume increases

## Rollback Procedures

### If Issues Occur

**Critical Issue (Stop Immediately)**
1. [ ] Set `FEATURE_FLAGS.enableReconciliation = false` in code
2. [ ] Redeploy to disable scheduled jobs
3. [ ] Investigate root cause
4. [ ] Fix issue
5. [ ] Re-enable and redeploy

**Data Inconsistency**
1. [ ] [ ] Stop the application
2. [ ] [ ] Restore database from backup
3. [ ] [ ] Investigate what went wrong
4. [ ] [ ] Implement fix
5. [ ] [ ] Redeploy and test thoroughly

**Stellar API Issues**
1. [ ] [ ] Monitor Stellar status page
2. [ ] [ ] If temporary: job will retry automatically
3. [ ] [ ] If extended outage: consider disabling jobs temporarily
4. [ ] [ ] Investigate alternative providers/failover

## Disaster Recovery

### Complete Failure Scenario

1. **Identify the Problem**
   - [ ] Check logs for error messages
   - [ ] Verify database connectivity
   - [ ] Check Stellar API status
   - [ ] Review recent code changes

2. **Immediate Actions**
   - [ ] Notify team members
   - [ ] Disable scheduled jobs if they're causing issues
   - [ ] Preserve logs and error data
   - [ ] Prepare database backup for recovery

3. **Recovery Steps**
   - [ ] Rollback to last known good version
   - [ ] Restore database from most recent backup
   - [ ] Verify system is operational
   - [ ] Re-enable scheduled jobs
   - [ ] Monitor closely for recurrence

4. **Post-Incident Review**
   - [ ] Document what happened
   - [ ] Identify root cause
   - [ ] Implement fix and deploy
   - [ ] Update monitoring/alerts to catch similar issues
   - [ ] Conduct team postmortem

## Maintenance Windows

### Regular Maintenance

**Weekly**
- [ ] Check disk space usage
- [ ] Review error logs
- [ ] Verify all jobs are executing
- [ ] Check Stellar API status

**Monthly**
- [ ] Database optimization (VACUUM, ANALYZE)
- [ ] Review and clean old notifications (if retention policy active)
- [ ] Audit transaction history
- [ ] Review performance metrics

**Quarterly**
- [ ] Major version updates
- [ ] Dependency security updates
- [ ] Disaster recovery drill
- [ ] Performance optimization review

## Compliance & Security

- [ ] [ ] No sensitive data in logs
- [ ] [ ] All database queries are parameterized
- [ ] [ ] Environment variables are not in code
- [ ] [ ] Secrets are managed securely
- [ ] [ ] Audit logs are retained
- [ ] [ ] Access control is properly configured
- [ ] [ ] Data retention policies are documented
- [ ] [ ] Compliance requirements are met (GDPR, etc.)

## Sign-Off

- **Developer**: _________________ Date: _______
- **QA Lead**: _________________ Date: _______
- **DevOps**: _________________ Date: _______
- **Project Manager**: _________________ Date: _______

## Deployment Summary

**Deployment Date**: _______________________
**Deployment Version**: ___________________
**Deployed By**: __________________________
**Notes**: ________________________________

---

## Quick Reference

### Critical Environment Variables
```
STELLAR_HORIZON_URL=https://horizon.stellar.org
STELLAR_NETWORK=PUBLIC
DB_HOST=<production-db-host>
DB_PORT=5432
DB_USERNAME=<secure-username>
DB_PASSWORD=<secure-password>
DB_NAME=nexafx
NODE_ENV=production
```

### Essential Database Indexes
```sql
CREATE INDEX idx_trans_status_created ON transactions(status, created_at);
CREATE INDEX idx_trans_user_status ON transactions(user_id, status);
CREATE INDEX idx_notif_user_status ON notifications(user_id, status);
```

### Key Monitoring Points
- Scheduled job execution logs
- Error rates and error types
- Database query performance
- Stellar API response times
- Memory and CPU usage
- Disk space usage

### Emergency Contacts
- **On-Call Engineer**: _____________________
- **Database Team**: _____________________
- **DevOps Lead**: _____________________
- **Product Owner**: _____________________

---

**Last Updated**: [Date of last review]
**Next Review**: [Scheduled review date]
