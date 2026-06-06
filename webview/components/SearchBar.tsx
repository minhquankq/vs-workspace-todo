import React from "react";
import Icon from "./Icon";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export default function SearchBar({ value, onChange }: Props) {
  return (
    <div className="p-search">
      <span className="s-ic">
        <Icon name="search" size={14} />
      </span>
      <input
        type="text"
        placeholder="Search todos…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button className="s-clear" onClick={() => onChange("")} title="Clear">
          <Icon name="close" size={12} />
        </button>
      )}
    </div>
  );
}
