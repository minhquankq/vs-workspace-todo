import React from "react";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export default function SearchBar({ value, onChange }: Props) {
  return (
    <div className="search-bar">
      <span className="search-bar__icon">⌕</span>
      <input
        type="text"
        className="search-bar__input"
        placeholder="Search todos…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button
          className="search-bar__clear"
          onClick={() => onChange("")}
          title="Clear search"
        >
          ×
        </button>
      )}
    </div>
  );
}
