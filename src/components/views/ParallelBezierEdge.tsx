import React from 'react';
import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react';

interface ParallelEdgeData extends Record<string, unknown> {
  sourceIndex?: number;
  sourceTotal?: number;
  targetIndex?: number;
  targetTotal?: number;
}

function getOffset(index: number, total: number, step: number): number {
  if (total <= 1) return 0;
  const totalSpan = (total - 1) * step;
  return index * step - totalSpan / 2;
}

export function ParallelBezierEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  data,
  markerEnd,
  markerStart,
}: EdgeProps) {
  const d = data as ParallelEdgeData;
  const sourceIndex = d?.sourceIndex ?? 0;
  const sourceTotal = d?.sourceTotal ?? 1;
  const targetIndex = d?.targetIndex ?? 0;
  const targetTotal = d?.targetTotal ?? 1;

  const offsetStep = 12;

  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;

  const srcOff = getOffset(sourceIndex, sourceTotal, offsetStep);
  const tgtOff = getOffset(targetIndex, targetTotal, offsetStep);

  const sx = sourceX + nx * srcOff;
  const sy = sourceY + ny * srcOff;
  const tx = targetX + nx * tgtOff;
  const ty = targetY + ny * tgtOff;

  const [edgePath] = getBezierPath({
    sourceX: sx,
    sourceY: sy,
    targetX: tx,
    targetY: ty,
    sourcePosition,
    targetPosition,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={style}
        markerEnd={markerEnd}
        markerStart={markerStart}
      />
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        pointerEvents="stroke"
        style={{ cursor: 'pointer' }}
      />
    </>
  );
}
