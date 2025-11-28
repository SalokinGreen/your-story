"use client";

import {
  Variable,
  NumberVariable,
  BooleanVariable,
  ListVariable,
} from "../misc/structs";
import { DynamicIcon } from "../components/DynamicIcon";

interface VariablesDisplayProps {
  variables: Variable[];
}

// Display-only component for showing variables in the game UI
export default function VariablesDisplay({ variables }: VariablesDisplayProps) {
  if (!variables || variables.length === 0) {
    return (
      <div className="p-4 text-center rounded-lg bg-blue-900/30 border border-blue-800/30">
        <p className="text-sm text-blue-200/40">No variables tracked</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {variables.map((variable) => (
        <VariableCard key={variable.id} variable={variable} />
      ))}
    </div>
  );
}

function VariableCard({ variable }: { variable: Variable }) {
  const getIcon = () => {
    switch (variable.type) {
      case "number":
        return "Hash";
      case "boolean":
        return "ToggleLeft";
      case "list":
        return "List";
      default:
        return "Variable";
    }
  };

  const getColorClass = () => {
    switch (variable.type) {
      case "number":
        return "bg-cyan-500/10 border-cyan-500/30 text-cyan-400";
      case "boolean":
        return "bg-emerald-500/10 border-emerald-500/30 text-emerald-400";
      case "list":
        return "bg-violet-500/10 border-violet-500/30 text-violet-400";
      default:
        return "bg-blue-500/10 border-blue-500/30 text-blue-400";
    }
  };

  const colorParts = getColorClass().split(" ");

  return (
    <div
      className={`flex flex-row items-start gap-3 p-3 rounded-lg border ${colorParts
        .slice(0, 2)
        .join(" ")}`}
    >
      <div className="shrink-0">
        <DynamicIcon name={getIcon()} className={`w-6 h-6 ${colorParts[2]}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-row items-center justify-between mb-1 gap-2">
          <span className="font-medium text-sm text-white">
            {variable.name}
          </span>
          <VariableValue variable={variable} />
        </div>
        {variable.description && (
          <p className="text-xs text-blue-200/60">{variable.description}</p>
        )}
        {variable.type === "number" && (
          <NumberVariableDetails variable={variable as NumberVariable} />
        )}
        {variable.type === "list" && (
          <ListVariableDetails variable={variable as ListVariable} />
        )}
      </div>
    </div>
  );
}

function VariableValue({ variable }: { variable: Variable }) {
  switch (variable.type) {
    case "number": {
      const numVar = variable as NumberVariable;
      return (
        <span className="font-bold text-sm text-cyan-400">{numVar.value}</span>
      );
    }
    case "boolean": {
      const boolVar = variable as BooleanVariable;
      return (
        <span
          className={`font-bold text-xs px-2 py-0.5 rounded ${
            boolVar.value
              ? "bg-emerald-500/20 text-emerald-400"
              : "bg-red-500/20 text-red-400"
          }`}
        >
          {boolVar.value ? "TRUE" : "FALSE"}
        </span>
      );
    }
    case "list": {
      const listVar = variable as ListVariable;
      return (
        <span className="font-bold text-xs text-violet-400">
          {listVar.items.length} items
          {listVar.maxSize && ` / ${listVar.maxSize} max`}
        </span>
      );
    }
    default:
      return null;
  }
}

function NumberVariableDetails({ variable }: { variable: NumberVariable }) {
  const hasRange =
    variable.minValue !== undefined || variable.maxValue !== undefined;

  if (!hasRange) return null;

  // Calculate fill percentage if we have both min and max
  if (variable.minValue !== undefined && variable.maxValue !== undefined) {
    const range = variable.maxValue - variable.minValue;
    const fillPercent =
      range > 0 ? ((variable.value - variable.minValue) / range) * 100 : 0;

    return (
      <div className="mt-2">
        <div className="flex justify-between text-xs text-blue-200/40 mb-1">
          <span>{variable.minValue}</span>
          <span>{variable.maxValue}</span>
        </div>
        <div className="w-full bg-blue-900/50 rounded-full h-1.5">
          <div
            className="bg-linear-to-r from-cyan-400 to-cyan-500 h-1.5 rounded-full transition-all duration-300"
            style={{ width: `${Math.min(Math.max(fillPercent, 0), 100)}%` }}
          />
        </div>
      </div>
    );
  }

  // Show just the bound if only one is defined
  return (
    <p className="text-xs text-blue-200/40 mt-1">
      {variable.minValue !== undefined && `Min: ${variable.minValue}`}
      {variable.minValue !== undefined &&
        variable.maxValue !== undefined &&
        " • "}
      {variable.maxValue !== undefined && `Max: ${variable.maxValue}`}
    </p>
  );
}

function ListVariableDetails({ variable }: { variable: ListVariable }) {
  if (variable.items.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {variable.items.map((item, index) => (
        <span
          key={index}
          className="px-2 py-0.5 text-xs rounded bg-violet-500/20 text-violet-300"
        >
          {item}
        </span>
      ))}
    </div>
  );
}
