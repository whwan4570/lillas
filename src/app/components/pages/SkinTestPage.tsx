import { useState } from 'react';
import { ArrowRight, ArrowLeft, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { SkinTestAnswers } from '../../types';

interface SkinTestPageProps {
  onNavigate: (page: string) => void;
  onComplete: (answers: SkinTestAnswers) => void;
}

type SingleStepField = 'skinType' | 'sensitivity' | 'routine' | 'budget';
type MultipleStepField = 'concerns';

interface StepOption {
  value: string;
  label: string;
  description?: string;
  emoji?: string;
}

type SkinTestStep =
  | {
      title: string;
      subtitle: string;
      type: 'single';
      field: SingleStepField;
      options: StepOption[];
    }
  | {
      title: string;
      subtitle: string;
      type: 'multiple';
      field: MultipleStepField;
      options: StepOption[];
    };

export function SkinTestPage({ onNavigate, onComplete }: SkinTestPageProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<SkinTestAnswers>({
    skinType: '',
    concerns: [],
    sensitivity: '',
    routine: '',
    budget: '',
    preferredIngredients: [],
    avoidIngredients: [],
    preferredBrands: []
  });

  const steps: SkinTestStep[] = [
    {
      title: 'What is your skin type?',
      subtitle: 'Select the option that best describes your skin',
      type: 'single',
      field: 'skinType',
      options: [
        {
          value: 'dry',
          label: 'Dry',
          description: 'Feels tight, flaky, or rough',
          emoji: '🏜️'
        },
        {
          value: 'oily',
          label: 'Oily',
          description: 'Shiny, enlarged pores, prone to breakouts',
          emoji: '✨'
        },
        {
          value: 'combination',
          label: 'Combination',
          description: 'Oily T-zone, dry cheeks',
          emoji: '🌗'
        },
        {
          value: 'normal',
          label: 'Normal',
          description: 'Balanced, not too oily or dry',
          emoji: '☀️'
        },
        {
          value: 'sensitive',
          label: 'Sensitive',
          description: 'Easily irritated, prone to redness',
          emoji: '🌸'
        }
      ]
    },
    {
      title: 'What are your main skin concerns?',
      subtitle: 'Select all that apply',
      type: 'multiple',
      field: 'concerns',
      options: [
        { value: 'acne', label: 'Acne & Breakouts', emoji: '🎯' },
        { value: 'aging', label: 'Fine Lines & Wrinkles', emoji: '✨' },
        { value: 'hydration', label: 'Dehydration', emoji: '💧' },
        { value: 'pigmentation', label: 'Dark Spots & Hyperpigmentation', emoji: '☀️' },
        { value: 'texture', label: 'Uneven Texture', emoji: '🔆' },
        { value: 'redness', label: 'Redness & Sensitivity', emoji: '🌸' },
        { value: 'pores', label: 'Large Pores', emoji: '⚪' },
        { value: 'dullness', label: 'Dullness', emoji: '🌟' }
      ]
    },
    {
      title: 'How sensitive is your skin?',
      subtitle: 'This helps us avoid potential irritants',
      type: 'single',
      field: 'sensitivity',
      options: [
        {
          value: 'not-sensitive',
          label: 'Not Sensitive',
          description: 'I can use most products without issues'
        },
        {
          value: 'somewhat',
          label: 'Somewhat Sensitive',
          description: 'Some ingredients cause mild reactions'
        },
        {
          value: 'very',
          label: 'Very Sensitive',
          description: 'My skin reacts to many products'
        }
      ]
    },
    {
      title: 'What is your current routine?',
      subtitle: 'Understanding your current habits helps us recommend better',
      type: 'single',
      field: 'routine',
      options: [
        {
          value: 'minimal',
          label: 'Minimal',
          description: 'Basic cleansing, maybe moisturizer'
        },
        {
          value: 'moderate',
          label: 'Moderate',
          description: 'Cleanse, treat, moisturize, SPF'
        },
        {
          value: 'extensive',
          label: 'Extensive',
          description: 'Multi-step routine with serums, treatments'
        }
      ]
    },
    {
      title: 'What is your budget per product?',
      subtitle: 'We will prioritize recommendations within your range',
      type: 'single',
      field: 'budget',
      options: [
        { value: 'budget', label: 'Under $25', description: 'Budget-friendly options' },
        { value: 'mid', label: '$25 - $50', description: 'Mid-range products' },
        { value: 'luxury', label: '$50+', description: 'Premium and luxury products' },
        { value: 'any', label: 'Any', description: 'Show me all options' }
      ]
    }
  ];

  const currentStepData = steps[currentStep];
  const progress = ((currentStep + 1) / steps.length) * 100;

  const handleSelect = (value: string) => {
    if (currentStepData.type === 'single') {
      setAnswers((prev) => ({ ...prev, [currentStepData.field]: value }));
    } else {
      setAnswers((prev) => {
        const selected = prev.concerns;
        const next = selected.includes(value)
          ? selected.filter((item) => item !== value)
          : [...selected, value];
        return { ...prev, concerns: next };
      });
    }
  };

  const canProceed = () => {
    if (currentStepData.type === 'single') {
      return answers[currentStepData.field] !== '';
    } else {
      return answers.concerns.length > 0;
    }
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete(answers);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-cream via-card to-muted/30 py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">
              Step {currentStep + 1} of {steps.length}
            </span>
            <span className="text-sm text-muted-foreground">{Math.round(progress)}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-primary to-sage"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="bg-card rounded-3xl p-8 md:p-12 shadow-xl border border-border/50"
          >
            <div className="mb-12">
              <h2
                className="text-3xl md:text-4xl mb-3"
                style={{ fontFamily: 'var(--font-serif)', fontWeight: 400 }}
              >
                {currentStepData.title}
              </h2>
              <p className="text-muted-foreground">{currentStepData.subtitle}</p>
            </div>

            <div className="space-y-3 mb-12">
              {currentStepData.options.map((option) => {
                const isSelected =
                  currentStepData.type === 'single'
                    ? answers[currentStepData.field as keyof typeof answers] === option.value
                    : ((answers[currentStepData.field as keyof SkinTestAnswers] as string[]) ?? []).includes(
                        option.value
                      );

                return (
                  <motion.button
                    key={option.value}
                    onClick={() => handleSelect(option.value)}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className={`w-full p-6 rounded-2xl border-2 transition-all duration-300 text-left ${
                      isSelected
                        ? 'border-primary bg-primary/5 shadow-lg shadow-primary/10'
                        : 'border-border hover:border-primary/30 hover:bg-muted/30'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      {option.emoji && <div className="text-3xl">{option.emoji}</div>}
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <span className="text-lg font-medium">{option.label}</span>
                          {isSelected && (
                            <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                              <Check className="w-4 h-4 text-primary-foreground" />
                            </div>
                          )}
                        </div>
                        {option.description && (
                          <p className="text-sm text-muted-foreground">{option.description}</p>
                        )}
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-4">
              <button
                onClick={() => currentStep > 0 && setCurrentStep(currentStep - 1)}
                disabled={currentStep === 0}
                className={`px-6 py-3 rounded-full border-2 border-border transition-all flex items-center gap-2 ${
                  currentStep === 0
                    ? 'opacity-50 cursor-not-allowed'
                    : 'hover:bg-muted hover:border-primary/30'
                }`}
              >
                <ArrowLeft className="w-5 h-5" />
                Back
              </button>

              <button
                onClick={handleNext}
                disabled={!canProceed()}
                className={`px-8 py-3 rounded-full transition-all flex items-center gap-2 ${
                  canProceed()
                    ? 'bg-primary text-primary-foreground hover:bg-forest shadow-lg shadow-primary/20'
                    : 'bg-muted text-muted-foreground cursor-not-allowed'
                }`}
              >
                {currentStep === steps.length - 1 ? 'Get Results' : 'Continue'}
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </motion.div>
        </AnimatePresence>

        <div className="mt-8 text-center">
          <button
            onClick={() => onNavigate('home')}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
