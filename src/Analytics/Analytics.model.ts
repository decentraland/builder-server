import { SQL } from 'decentraland-server'
import { getAnalyticsClient } from '../database'
import { WeeklyStats } from './Analytics.types'

export namespace Analytics {
  export async function getWeekly(base: string): Promise<WeeklyStats | null> {
    try {
      return await getAnalyticsClient(async (client) => {
        const result = await client.query(
          SQL`SELECT *
            FROM analytics.scene_open_data_weekly
            WHERE base = ${base}
            ORDER BY week DESC
            LIMIT 1`
        )

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
            max_concurrent_users_time,
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
            max_concurrent_users_time,
          }
        }

        return weekly
      })
    } catch (error) {
      console.error(error)
      return null
    }
  }

  export async function getStatus() {
    try {
      return await getAnalyticsClient(async () => true)
    } catch (error) {
      return false
    }
  }
}
