/* eslint-disable react-refresh/only-export-components */
 
import React, { createContext, useContext, useState, ReactNode } from 'react';

// Define the user experience levels
export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';

// Define the features available at each level
interface ExperienceFeatures {
  visualBuilder: boolean;
  naturalLanguage: boolean;
  codeEditor: boolean;
  templates: boolean;
  advancedLogic: boolean;
  performanceVisualization: boolean;
}

// Define the context type
interface ExperienceLevelContextType {
  level: ExperienceLevel;
  features: ExperienceFeatures;
  setLevel: (level: ExperienceLevel) => void;
  getFeatures: () => ExperienceFeatures;
}

// Create the context with default values
const ExperienceLevelContext = createContext<ExperienceLevelContextType | undefined>(undefined);

// Provider component
interface ExperienceLevelProviderProps {
  children: ReactNode;
  defaultLevel?: ExperienceLevel;
}

export const ExperienceLevelProvider: React.FC<ExperienceLevelProviderProps> = ({ 
  children, 
  defaultLevel = 'beginner' 
}) => {
  const [level, setLevel] = useState<ExperienceLevel>(defaultLevel);

  // Define feature availability for each experience level
  const getFeatures = (): ExperienceFeatures => {
    switch (level) {
      case 'beginner':
        return {
          visualBuilder: true,
          naturalLanguage: true,
          codeEditor: false,
          templates: true,
          advancedLogic: false,
          performanceVisualization: false
        };
      case 'intermediate':
        return {
          visualBuilder: true,
          naturalLanguage: true,
          codeEditor: true,
          templates: true,
          advancedLogic: true,
          performanceVisualization: true
        };
      case 'advanced':
        return {
          visualBuilder: true,
          naturalLanguage: true,
          codeEditor: true,
          templates: true,
          advancedLogic: true,
          performanceVisualization: true
        };
      default:
        return {
          visualBuilder: true,
          naturalLanguage: true,
          codeEditor: false,
          templates: true,
          advancedLogic: false,
          performanceVisualization: false
        };
    }
  };

  const value = {
    level,
    features: getFeatures(),
    setLevel,
    getFeatures
  };

  return (
    <ExperienceLevelContext.Provider value={value}>
      {children}
    </ExperienceLevelContext.Provider>
  );
};

// Custom hook for using the context
export const useExperienceLevel = (): ExperienceLevelContextType => {
  const context = useContext(ExperienceLevelContext);
  if (context === undefined) {
    throw new Error('useExperienceLevel must be used within an ExperienceLevelProvider');
  }
  return context;
};

// Hook to check if a specific feature is available
export const useFeature = (feature: keyof ExperienceFeatures): boolean => {
  const { features } = useExperienceLevel();
  return features[feature];
};