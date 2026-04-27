const { z } = require('zod');

const TriggerSchema = z.object({
  type: z.enum(['natural_language','time','webhook','api_event','device_event','health_event']),
  value: z.string().nullish(),
  source: z.enum(['user_input','smartthings','samsung_health','github','schedule']).nullish(),
  event: z.string().nullish(),
  recurrence: z.string().nullish(),  // RRULE string
  repo: z.string().nullish(),
});

const ConditionSchema = z.object({
  type: z.enum(['time_range','device_state','day_of_week','location']),
  value: z.string(),
});

const ActionSchema = z.object({
  service: z.enum(['smartthings','simulation','openclaw','slack','github','smtp','webhook']),
  device_id: z.string().nullish(),
  command: z.string(),
  params: z.record(z.string(), z.any()).optional().default({}),
});

const SkillCreateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().nullish(),
  trigger: TriggerSchema,
  conditions: z.array(ConditionSchema).optional().default([]),
  actions: z.array(ActionSchema).min(1, 'At least one action required'),
});

function validateSkill(data) {
  const result = SkillCreateSchema.safeParse(data);
  if (!result.success) {
    return {
      valid: false,
      errors: result.error.issues.map(e => `${e.path.join('.')}: ${e.message}`)
    };
  }
  return { valid: true, data: result.data };
}

module.exports = { validateSkill, SkillCreateSchema };
