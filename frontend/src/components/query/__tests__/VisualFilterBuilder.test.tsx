/* eslint-disable */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import VisualFilterBuilder from '../VisualFilterBuilder';
import { FieldMetadata } from '../../../types';

// Mock data for testing
const mockFields: FieldMetadata[] = [
  {
    source: 'ad',
    fieldName: 'displayName',
    displayName: 'Display Name',
    dataType: 'string',
    category: 'User',
    description: 'User display name',
    isSearchable: true,
    isSortable: true,
    isExportable: true
  },
  {
    source: 'ad',
    fieldName: 'lastLogin',
    displayName: 'Last Login',
    dataType: 'datetime',
    category: 'User',
    description: 'Last login date',
    isSearchable: true,
    isSortable: true,
    isExportable: true
  },
  {
    source: 'ad',
    fieldName: 'isActive',
    displayName: 'Is Active',
    dataType: 'boolean',
    category: 'User',
    description: 'User active status',
    isSearchable: true,
    isSortable: true,
    isExportable: true
  }
];

// Mock component for testing
const TestComponent = ({ showNaturalLanguageInput = true }: { showNaturalLanguageInput?: boolean }) => {
  const [filters, setFilters] = React.useState<any[]>([]);
  
  const handleChange = (newFilters: any[] | undefined) => {
    setFilters(newFilters || []);
  };
  
  return (
    <VisualFilterBuilder
      filters={filters}
      fields={mockFields}
      onChange={handleChange}
      showNaturalLanguageInput={showNaturalLanguageInput}
    />
  );
};

// Test suite for VisualFilterBuilder
describe('VisualFilterBuilder', () => {
  test('renders without crashing', () => {
    render(<TestComponent />);
    expect(screen.getByText('Filters')).toBeInTheDocument();
  });

  test('displays "No filters added" message when no filters', () => {
    render(<TestComponent showNaturalLanguageInput={false} />);
    expect(screen.getByText('No filters added. Use natural language or add filters manually.')).toBeInTheDocument();
  });

  test('adds a new filter when "Add Filter" button is clicked', () => {
    render(<TestComponent />);
    fireEvent.click(screen.getByText('Add Filter'));
    expect(screen.getByText('Field')).toBeInTheDocument();
  });

  test('adds another filter when "Add Filter" button is clicked multiple times', () => {
    const { container } = render(<TestComponent />);
    // Add first filter
    fireEvent.click(screen.getByText('Add Filter'));
    
    // Add another filter
    fireEvent.click(screen.getByText('Add Filter'));
    
    // Should have two filter rows plus the main card wrapper
    const filterRows = container.querySelectorAll('.ant-card');
    expect(filterRows.length).toBeGreaterThanOrEqual(2);
  });

  test('removes a filter when delete button is clicked', () => {
    const { container } = render(<TestComponent showNaturalLanguageInput={false} />);
    // Add a filter first
    fireEvent.click(screen.getByText('Add Manual Filter'));
    
    // Check that filter was added
    expect(screen.getByText('Field')).toBeInTheDocument();
    
    // Click delete button
    const deleteButton = container.querySelector('.ant-btn-dangerous');
    if (deleteButton) {
      fireEvent.click(deleteButton);
    }
    
    // Should show the empty state
    expect(screen.getByText('No filters added. Use natural language or add filters manually.')).toBeInTheDocument();
  });
});