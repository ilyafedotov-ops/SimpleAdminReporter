import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen, fireEvent, waitFor } from '@/utils/test-utils';
import { FilterBuilder } from './FilterBuilder';
import type { ReportFilter, FieldMetadata } from '@/types';

describe('FilterBuilder', () => {
  const mockFields: FieldMetadata[] = [
    {
      source: 'ad',
      fieldName: 'displayName',
      displayName: 'Display Name',
      dataType: 'string',
      category: 'basic',
      isSearchable: true,
      isSortable: true,
      isExportable: true,
    },
    {
      source: 'ad',
      fieldName: 'lastLogonDate',
      displayName: 'Last Logon Date',
      dataType: 'datetime',
      category: 'activity',
      isSearchable: true,
      isSortable: true,
      isExportable: true,
    },
    {
      source: 'ad',
      fieldName: 'accountEnabled',
      displayName: 'Account Enabled',
      dataType: 'boolean',
      category: 'status',
      isSearchable: true,
      isSortable: true,
      isExportable: true,
    },
    {
      source: 'ad',
      fieldName: 'memberOf',
      displayName: 'Member Of',
      dataType: 'array',
      category: 'membership',
      isSearchable: true,
      isSortable: false,
      isExportable: true,
    },
  ];

  const defaultProps = {
    filters: [],
    fields: mockFields,
    onChange: vi.fn(),
  };

  it('should render empty state when no filters', () => {
    renderWithProviders(<FilterBuilder {...defaultProps} />);
    
    expect(screen.getByText('No filters added')).toBeInTheDocument();
    expect(screen.getByText('Add Filter')).toBeInTheDocument();
  });

  it('should add a new filter when Add Filter is clicked', () => {
    const onChange = vi.fn();
    renderWithProviders(<FilterBuilder {...defaultProps} onChange={onChange} />);
    
    fireEvent.click(screen.getByText('Add Filter'));
    
    expect(onChange).toHaveBeenCalledWith([
      {
        field: '',
        operator: 'equals',
        value: '',
        dataType: 'string',
      },
    ]);
  });

  it('should render existing filters', () => {
    const filters: ReportFilter[] = [
      {
        field: 'displayName',
        operator: 'contains',
        value: 'John',
        dataType: 'string',
      },
    ];
    
    renderWithProviders(<FilterBuilder {...defaultProps} filters={filters} />);
    
    expect(screen.getByText('Display Name')).toBeInTheDocument();
    expect(screen.getByText('Contains')).toBeInTheDocument();
    expect(screen.getByDisplayValue('John')).toBeInTheDocument();
  });

  it('should update filter field', async () => {
    const onChange = vi.fn();
    const filters: ReportFilter[] = [
      {
        field: '',
        operator: 'equals',
        value: '',
        dataType: 'string',
      },
    ];
    
    renderWithProviders(
      <FilterBuilder {...defaultProps} filters={filters} onChange={onChange} />
    );
    
    // Find all selects - first one should be the field selector
    const selectors = screen.getAllByRole('combobox');
    const fieldSelector = selectors[0];
    fireEvent.mouseDown(fieldSelector);
    
    // Select a field from dropdown
    await waitFor(() => {
      const displayNameOption = screen.getByText('Display Name');
      fireEvent.click(displayNameOption);
    });
    
    expect(onChange).toHaveBeenCalledWith([
      {
        field: 'displayName',
        operator: 'equals',
        value: '',
        dataType: 'string',
      },
    ]);
  });

  it('should update filter operator', async () => {
    const onChange = vi.fn();
    const filters: ReportFilter[] = [
      {
        field: 'displayName',
        operator: 'equals',
        value: '',
        dataType: 'string',
      },
    ];
    
    renderWithProviders(
      <FilterBuilder {...defaultProps} filters={filters} onChange={onChange} />
    );
    
    // Click on the operator selector
    const operatorSelectors = screen.getAllByRole('combobox');
    fireEvent.mouseDown(operatorSelectors[1]); // Second combobox is operator
    
    // Select an operator
    await waitFor(() => {
      fireEvent.click(screen.getByText('Contains'));
    });
    
    expect(onChange).toHaveBeenCalledWith([
      {
        field: 'displayName',
        operator: 'contains',
        value: '',
        dataType: 'string',
      },
    ]);
  });

  it('should update filter value for string type', () => {
    const onChange = vi.fn();
    const filters: ReportFilter[] = [
      {
        field: 'displayName',
        operator: 'contains',
        value: '',
        dataType: 'string',
      },
    ];
    
    renderWithProviders(
      <FilterBuilder {...defaultProps} filters={filters} onChange={onChange} />
    );
    
    const input = screen.getByPlaceholderText('Enter value...');
    fireEvent.change(input, { target: { value: 'John' } });
    
    expect(onChange).toHaveBeenCalledWith([
      {
        field: 'displayName',
        operator: 'contains',
        value: 'John',
        dataType: 'string',
      },
    ]);
  });

  it('should not show value input for isEmpty/isNotEmpty operators', () => {
    const filters: ReportFilter[] = [
      {
        field: 'displayName',
        operator: 'isEmpty',
        value: '',
        dataType: 'string',
      },
    ];
    
    renderWithProviders(<FilterBuilder {...defaultProps} filters={filters} />);
    
    expect(screen.queryByPlaceholderText('Enter value...')).not.toBeInTheDocument();
  });

  it('should render boolean select for boolean fields', async () => {
    const onChange = vi.fn();
    const filters: ReportFilter[] = [
      {
        field: 'accountEnabled',
        operator: 'equals',
        value: '',
        dataType: 'boolean',
      },
    ];
    
    renderWithProviders(
      <FilterBuilder {...defaultProps} filters={filters} onChange={onChange} />
    );
    
    // Should have a select for boolean values
    const selects = screen.getAllByRole('combobox');
    const booleanSelect = selects[selects.length - 1]; // Last select is the value select
    
    fireEvent.mouseDown(booleanSelect);
    
    await waitFor(() => {
      expect(screen.getByText('True')).toBeInTheDocument();
      expect(screen.getByText('False')).toBeInTheDocument();
    });
  });

  it('should remove a filter', () => {
    const onChange = vi.fn();
    const filters: ReportFilter[] = [
      {
        field: 'displayName',
        operator: 'contains',
        value: 'John',
        dataType: 'string',
      },
      {
        field: 'accountEnabled',
        operator: 'equals',
        value: true,
        dataType: 'boolean',
      },
    ];
    
    renderWithProviders(
      <FilterBuilder {...defaultProps} filters={filters} onChange={onChange} />
    );
    
    // Click delete button on first filter
    const deleteButtons = screen.getAllByLabelText('delete');
    fireEvent.click(deleteButtons[0]);
    
    expect(onChange).toHaveBeenCalledWith([
      {
        field: 'accountEnabled',
        operator: 'equals',
        value: true,
        dataType: 'boolean',
      },
    ]);
  });

  it('should duplicate a filter', () => {
    const onChange = vi.fn();
    const filters: ReportFilter[] = [
      {
        field: 'displayName',
        operator: 'contains',
        value: 'John',
        dataType: 'string',
      },
    ];
    
    renderWithProviders(
      <FilterBuilder {...defaultProps} filters={filters} onChange={onChange} />
    );
    
    // Click copy button
    const copyButton = screen.getByLabelText('copy');
    fireEvent.click(copyButton);
    
    expect(onChange).toHaveBeenCalledWith([
      {
        field: 'displayName',
        operator: 'contains',
        value: 'John',
        dataType: 'string',
      },
      {
        field: 'displayName',
        operator: 'contains',
        value: 'John',
        dataType: 'string',
      },
    ]);
  });

  it('should respect maxFilters limit', () => {
    const filters: ReportFilter[] = Array(5).fill(null).map(() => ({
      field: 'displayName',
      operator: 'equals',
      value: 'test',
      dataType: 'string' as const,
    }));
    
    renderWithProviders(
      <FilterBuilder {...defaultProps} filters={filters} maxFilters={5} />
    );
    
    const addButton = screen.getByText('Add Filter');
    expect(addButton.closest('button')).toBeDisabled();
    
    // Copy buttons should also be disabled
    const copyButtons = screen.getAllByLabelText('copy');
    copyButtons.forEach(button => {
      expect(button.closest('button')).toBeDisabled();
    });
  });

  it('should show appropriate operators for different data types', async () => {
    const filters: ReportFilter[] = [
      {
        field: 'lastLogonDate',
        operator: 'equals',
        value: '',
        dataType: 'datetime',
      },
    ];
    
    renderWithProviders(<FilterBuilder {...defaultProps} filters={filters} />);
    
    // Click on operator selector
    const operatorSelectors = screen.getAllByRole('combobox');
    fireEvent.mouseDown(operatorSelectors[1]);
    
    await waitFor(() => {
      // Should show datetime-specific operators
      expect(screen.getByText('After')).toBeInTheDocument();
      expect(screen.getByText('Before')).toBeInTheDocument();
      expect(screen.getByText('On or After')).toBeInTheDocument();
      expect(screen.getByText('On or Before')).toBeInTheDocument();
    });
  });

  it('should handle array type filters', async () => {
    const filters: ReportFilter[] = [
      {
        field: 'memberOf',
        operator: 'equals', // Start with a different operator
        value: '',
        dataType: 'string',
      },
    ];
    
    renderWithProviders(<FilterBuilder {...defaultProps} filters={filters} />);
    
    // Click on operator selector
    const operatorSelectors = screen.getAllByRole('combobox');
    fireEvent.mouseDown(operatorSelectors[1]);
    
    await waitFor(() => {
      // Should show array-specific operators
      const containsOptions = screen.getAllByText('Contains');
      expect(containsOptions.length).toBeGreaterThan(0);
      expect(screen.getByText('Not Contains')).toBeInTheDocument();
      expect(screen.getByText('Is Empty')).toBeInTheDocument();
      expect(screen.getByText('Is Not Empty')).toBeInTheDocument();
    });
  });
});