import { Injectable } from '@nestjs/common';
import { User } from '../entities/user.entity';

interface ProfileField {
  name: keyof User | 'isPhoneVerified';
  label: string;
  required: boolean;
  weight: number;
}

@Injectable()
export class ProfileProgressService {
  private readonly profileFields: ProfileField[] = [
    { name: 'firstName', label: 'First Name', required: true, weight: 15 },
    { name: 'lastName', label: 'Last Name', required: true, weight: 15 },
    { name: 'dateOfBirth', label: 'Date of Birth', required: true, weight: 15 },
    { name: 'address', label: 'Address', required: true, weight: 20 },
    { name: 'phoneNumber', label: 'Phone Number', required: true, weight: 15 },
    { name: 'isPhoneVerified', label: 'Phone Verification', required: true, weight: 20 },
  ];

  calculateCompletion(user: User): number {
    let totalWeight = 0;
    let completedWeight = 0;

    for (const field of this.profileFields) {
      if (!field.required) continue;
      totalWeight += field.weight;
      const value = (user as unknown as Record<string, unknown>)[field.name as string];
      if (this.isFieldComplete(value)) {
        completedWeight += field.weight;
      }
    }

    return Math.round((completedWeight / totalWeight) * 100);
  }

  getRequiredFields(): string[] {
    return this.profileFields.filter((f) => f.required).map((f) => f.label);
  }

  getMissingFields(user: User): string[] {
    return this.profileFields
      .filter((f) => f.required && !this.isFieldComplete((user as any)[f.name]))
      .map((f) => f.label);
  }

  canInitiateVerification(user: User): boolean {
    const completion = this.calculateCompletion(user);
    return completion === 100 && user.isPhoneVerified;
  }

  getProgressDetails(user: User): {
    percentage: number;
    completedFields: string[];
    missingFields: string[];
    nextSteps: string[];
  } {
    const percentage = this.calculateCompletion(user);
    const missingFields = this.getMissingFields(user);

    const nextSteps: string[] = [];
    if (missingFields.length > 0) {
      nextSteps.push(`Complete the following fields: ${missingFields.join(', ')}`);
    }
    if (!user.isPhoneVerified) {
      nextSteps.push('Verify your phone number');
    }
    if (percentage === 100 && user.verificationStatus === 'unverified') {
      nextSteps.push('Upload verification documents and initiate verification');
    }

    return {
      percentage,
      completedFields: this.getCompletedFields(user),
      missingFields,
      nextSteps,
    };
  }

  private getCompletedFields(user: User): string[] {
    return this.profileFields
      .filter((f) => f.required && this.isFieldComplete((user as any)[f.name]))
      .map((f) => f.label);
  }

  private isFieldComplete(value: unknown): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string' && value.trim() === '') return false;
    if (typeof value === 'boolean') return value;
    return true;
  }
}


