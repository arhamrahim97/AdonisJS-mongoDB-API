import type { HttpContext } from '@adonisjs/core/http'

export default class ApiKeyEnv {
  public async handle({ request, response }: HttpContext, next: () => Promise<void>) {
    const apiKey = request.header('x-api-key') || request.qs()['api_key']
    if (!apiKey) return response.unauthorized({ error: 'Missing API key' })

    const allowed = (process.env.API_KEYS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    if (!allowed.includes(apiKey)) {
      return response.unauthorized({ error: 'Invalid API key' })
    }

    await next()
  }
}
