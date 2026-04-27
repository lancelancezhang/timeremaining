import type { GroupBase, StylesConfig } from 'react-select'

const border = 'rgba(15, 23, 42, 0.12)'
const borderFocus = 'rgba(79, 70, 229, 0.45)'
const ring = '0 0 0 4px rgba(79, 70, 229, 0.12)'

/**
 * Base styles; cast at the call site to your option type (react-select is strict on StylesConfig).
 */
export const formSelectStyles: StylesConfig<unknown, false, GroupBase<unknown>> = {
    control: (base, state) => ({
      ...base,
      minHeight: 52,
      fontSize: 18,
      borderRadius: 12,
      borderColor: state.isFocused ? borderFocus : border,
      boxShadow: state.isFocused ? ring : 'none',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      cursor: 'pointer',
      '&:hover': { borderColor: 'rgba(79, 70, 229, 0.35)' },
    }),
    valueContainer: (base) => ({ ...base, padding: '0 8px' }),
    placeholder: (base) => ({ ...base, color: 'rgba(15, 23, 42, 0.45)' }),
    singleValue: (base) => ({ ...base, color: 'rgba(15, 23, 42, 0.92)' }),
    input: (base) => ({ ...base, color: 'rgba(15, 23, 42, 0.92)' }),
    menu: (base) => ({
      ...base,
      borderRadius: 12,
      overflow: 'hidden',
      boxShadow: '0 12px 40px rgba(15, 23, 42, 0.12)',
      border: `1px solid ${border}`,
    }),
    menuList: (base) => ({ ...base, padding: 4, maxHeight: 280 }),
    menuPortal: (base) => ({ ...base, zIndex: 30 }),
    option: (base, state) => ({
      ...base,
      fontSize: 16,
      borderRadius: 8,
      cursor: 'pointer',
      color: 'rgba(15, 23, 42, 0.92)',
      backgroundColor: state.isSelected
        ? 'rgba(79, 70, 229, 0.18)'
        : state.isFocused
          ? 'rgba(79, 70, 229, 0.08)'
          : 'transparent',
      '&:active': { backgroundColor: 'rgba(79, 70, 229, 0.14)' },
    }),
    indicatorSeparator: () => ({ display: 'none' }),
    dropdownIndicator: (base, state) => ({
      ...base,
      color: 'rgba(15, 23, 42, 0.5)',
      transform: state.selectProps.menuIsOpen ? 'rotate(180deg)' : undefined,
      transition: 'transform 0.15s ease',
    }),
    clearIndicator: (base) => ({
      ...base,
      color: 'rgba(15, 23, 42, 0.45)',
    }),
};