import type { DomainEventType } from '../types';

export interface EventDefinition {
  type: DomainEventType;
  label: string;
  description: string;
}

export const EVENT_DEFINITIONS: EventDefinition[] = [
  {
    type: 'task.status.changed',
    label: 'Task status changed',
    description: 'Fires when a task moves from one status to another.',
  },
  {
    type: 'task.completed',
    label: 'Task completed',
    description: 'Fires when a task reaches completion.',
  },
  {
    type: 'task.comment.added',
    label: 'Task comment added',
    description: 'Fires when a new comment is added to a task.',
  },
  {
    type: 'task.assignee.changed',
    label: 'Task assignee changed',
    description: 'Fires when the assignee of a task changes.',
  },
];

export function isSupportedEventType(type: string): type is DomainEventType {
  return EVENT_DEFINITIONS.some(def => def.type === type);
}

export function getSupportedEventTypes(): DomainEventType[] {
  return EVENT_DEFINITIONS.map(def => def.type);
}

export function getEventDefinition(type: DomainEventType): EventDefinition | undefined {
  return EVENT_DEFINITIONS.find(def => def.type === type);
}
