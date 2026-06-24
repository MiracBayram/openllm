import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { Icon } from './Icon';

export interface SelectOption {
  label: string;
  value: string;
}

interface SelectProps {
  value: string;
  options: SelectOption[];
  onChange: (val: string) => void;
  className?: string;
  renderOption?: (option: SelectOption) => any;
  renderValue?: (option: SelectOption | undefined) => any;
}

export function Select({ value, options, onChange, className = '', renderOption, renderValue }: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen]);

  const selectedOption = options.find(o => o.value === value) || options[0];

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between bg-forge-bg border border-forge-border rounded-md px-3 py-2 text-sm text-forge-text focus:outline-none focus:border-forge-accent/50 transition-colors shadow-sm"
      >
        <span className="truncate">{renderValue ? renderValue(selectedOption) : (selectedOption?.label || "Select Option")}</span>
        <Icon icon={ChevronDown} size={16} className={`text-forge-text-muted transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-forge-surface border border-forge-border rounded-md shadow-xl py-1 overflow-hidden">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-forge-surface-3 transition-colors ${
                option.value === value ? 'text-forge-accent font-medium' : 'text-forge-text'
              }`}
            >
              <div className="flex-1 text-left">{renderOption ? renderOption(option) : option.label}</div>
              {option.value === value && <Icon icon={Check} size={14} className="text-forge-accent" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
