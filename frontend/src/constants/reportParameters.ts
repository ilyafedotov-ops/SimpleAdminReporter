import { ReportParameter } from '../types';

// Example parameter configurations for common report types
export const commonReportParameters: Record<string, ReportParameter[]> = {
  inactiveUsers: [
    {
      name: 'days',
      displayName: 'Days Inactive',
      type: 'number',
      required: true,
      defaultValue: 90,
      min: 1,
      max: 365,
      description: 'Number of days since last login'
    }
  ],
  passwordExpiry: [
    {
      name: 'warningDays',
      displayName: 'Warning Days',
      type: 'number',
      required: true,
      defaultValue: 30,
      min: 1,
      max: 90,
      description: 'Days before password expiry to show warning'
    }
  ],
  groupMembers: [
    {
      name: 'groupName',
      displayName: 'Group Name',
      type: 'string',
      required: true,
      description: 'Name of the Active Directory group'
    }
  ],
  dateRange: [
    {
      name: 'startDate',
      displayName: 'Start Date',
      type: 'date',
      required: true,
      description: 'Start date for the report period'
    },
    {
      name: 'endDate',
      displayName: 'End Date',
      type: 'date',
      required: true,
      description: 'End date for the report period'
    }
  ],
  recentPasswordChanges: [
    {
      name: 'hours',
      displayName: 'Hours',
      type: 'number',
      required: true,
      defaultValue: 1,
      min: 1,
      max: 168,
      description: 'Number of hours to look back for password changes'
    }
  ],
  passwordChangesByDay: [
    {
      name: 'days',
      displayName: 'Days',
      type: 'number',
      required: true,
      defaultValue: 7,
      min: 1,
      max: 365,
      description: 'Number of days to look back for password changes'
    }
  ],
  userActivity: [
    {
      name: 'days',
      displayName: 'Days',
      type: 'number',
      required: true,
      defaultValue: 30,
      min: 1,
      max: 365,
      description: 'Number of days to look back for user activity'
    }
  ]
};