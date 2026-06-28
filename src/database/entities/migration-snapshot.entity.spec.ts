import { MigrationSnapshot, SnapshotStatus } from './migration-snapshot.entity';

describe('MigrationSnapshot entity', () => {
  // ---------------------------------------------------------------------------
  // Enum values
  // ---------------------------------------------------------------------------
  describe('SnapshotStatus enum', () => {
    it('should export PENDING status', () => {
      expect(SnapshotStatus.PENDING).toBe('PENDING');
    });

    it('should export APPLIED status', () => {
      expect(SnapshotStatus.APPLIED).toBe('APPLIED');
    });

    it('should export ROLLED_BACK status', () => {
      expect(SnapshotStatus.ROLLED_BACK).toBe('ROLLED_BACK');
    });

    it('should contain exactly three status values', () => {
      const values = Object.values(SnapshotStatus);
      expect(values).toHaveLength(3);
      expect(values).toEqual(
        expect.arrayContaining(['PENDING', 'APPLIED', 'ROLLED_BACK']),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Entity instantiation
  // ---------------------------------------------------------------------------
  describe('entity fields', () => {
    let snapshot: MigrationSnapshot;

    beforeEach(() => {
      snapshot = new MigrationSnapshot();
    });

    it('should instantiate without errors', () => {
      expect(snapshot).toBeInstanceOf(MigrationSnapshot);
    });

    it('should allow setting id', () => {
      snapshot.id = 'test-uuid-1234';
      expect(snapshot.id).toBe('test-uuid-1234');
    });

    it('should allow setting environment', () => {
      snapshot.environment = 'staging';
      expect(snapshot.environment).toBe('staging');
    });

    it('should allow setting snapshotKey', () => {
      const key = 'nexafx/pre-migration/staging/2026-06-27T00-00-00Z-3.dump';
      snapshot.snapshotKey = key;
      expect(snapshot.snapshotKey).toBe(key);
    });

    it('should allow setting migrationCount', () => {
      snapshot.migrationCount = 3;
      expect(snapshot.migrationCount).toBe(3);
    });

    it('should allow setting status to each valid value', () => {
      for (const status of Object.values(SnapshotStatus)) {
        snapshot.status = status as SnapshotStatus;
        expect(snapshot.status).toBe(status);
      }
    });

    it('should allow setting appliedAt to a Date', () => {
      const now = new Date();
      snapshot.appliedAt = now;
      expect(snapshot.appliedAt).toBe(now);
    });

    it('should allow setting appliedAt to null', () => {
      snapshot.appliedAt = null;
      expect(snapshot.appliedAt).toBeNull();
    });

    it('should allow setting rolledBackAt to a Date', () => {
      const now = new Date();
      snapshot.rolledBackAt = now;
      expect(snapshot.rolledBackAt).toBe(now);
    });

    it('should allow setting rolledBackAt to null', () => {
      snapshot.rolledBackAt = null;
      expect(snapshot.rolledBackAt).toBeNull();
    });

    it('should allow setting takenAt', () => {
      const now = new Date();
      snapshot.takenAt = now;
      expect(snapshot.takenAt).toBe(now);
    });
  });

  // ---------------------------------------------------------------------------
  // Lifecycle transitions
  // ---------------------------------------------------------------------------
  describe('status lifecycle', () => {
    it('should transition from PENDING → APPLIED', () => {
      const snapshot = new MigrationSnapshot();
      snapshot.status = SnapshotStatus.PENDING;
      expect(snapshot.status).toBe(SnapshotStatus.PENDING);

      snapshot.status = SnapshotStatus.APPLIED;
      snapshot.appliedAt = new Date();
      expect(snapshot.status).toBe(SnapshotStatus.APPLIED);
      expect(snapshot.appliedAt).toBeInstanceOf(Date);
    });

    it('should transition from APPLIED → ROLLED_BACK', () => {
      const snapshot = new MigrationSnapshot();
      snapshot.status = SnapshotStatus.APPLIED;
      snapshot.appliedAt = new Date();

      snapshot.status = SnapshotStatus.ROLLED_BACK;
      snapshot.rolledBackAt = new Date();
      expect(snapshot.status).toBe(SnapshotStatus.ROLLED_BACK);
      expect(snapshot.rolledBackAt).toBeInstanceOf(Date);
    });
  });
});
