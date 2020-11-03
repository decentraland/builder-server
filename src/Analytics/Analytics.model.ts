import { QueryResult } from 'pg'
import { SQL } from 'decentraland-server'
import { analytics } from '../database'
import { WeeklyStats } from './Analytics.types'

export const CONNECTION_ERROR = 'connection terminated'
export const TIMEOUT_ERROR = 'ETIMEDOUT'
const TIMEOUT_MS = 30000

export class Analytics {
  static db = analytics

  static async getWeekly(
    base: string,
    retry = true
  ): Promise<WeeklyStats | null> {
    try {
      const result = await Promise.race([
        Analytics.db.client.query(
          SQL`SELECT * 
            FROM analytics.scene_open_data_weekly 
            WHERE base = ${base} 
            ORDER BY week DESC 
            LIMIT 1`
        ),
        // force a timeout at 30 seconds, because sometimes the connection hangs indefinetely
        new Promise<QueryResult<any>>((_, reject) =>
          setTimeout(() => reject(new Error(TIMEOUT_ERROR)), TIMEOUT_MS)
        )
      ])

      let weekly: WeeklyStats | null = null

      if (result.rows.length > 0) {
        const {
          week,
          title,
          base,
          users,
          sessions,
          median_session_time,
          min_session_time,
          average_session_time,
          max_session_time,
          direct_users,
          direct_sessions,
          max_concurrent_users,
          max_concurrent_users_time
        } = result.rows[0]

        weekly = {
          week,
          title,
          base,
          users: parseInt(users, 10),
          sessions: parseInt(sessions, 10),
          median_session_time: parseInt(median_session_time, 10),
          min_session_time: parseInt(min_session_time, 10),
          average_session_time: parseInt(average_session_time, 10),
          max_session_time: parseInt(max_session_time, 10),
          direct_users: parseInt(direct_users, 10),
          direct_sessions: parseInt(direct_sessions, 10),
          max_concurrent_users: parseInt(max_concurrent_users, 10),
          max_concurrent_users_time
        }
      }

      return weekly
    } catch (error) {
      // Retry logic for timeouts
      if (
        typeof error.message === 'string' &&
        error.message.includes(TIMEOUT_ERROR) &&
        retry
      ) {
        await this.db.connect()
        return this.getWeekly(base, false)
      }
      return null
    }
  }
}
