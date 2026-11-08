import client from './client'

export const statsApi = {
  dashboard: () => client.get('/stats/dashboard'),
}

export const agentsApi = {
  pipeline: (issueId) => client.get(`/agents/pipeline/${issueId}`),
  logs:     (issueId) => client.get(`/agents/logs/${issueId}`),
}

export const issuesApi = {
  list: (params) => client.get('/issues/', { params }),
  get:  (id)     => client.get(`/issues/${id}`),
  workers: ()    => client.get('/issues/workers'),

  /**
   * Submit a new issue report.
   * @param {object} fields  - { title, description, latitude, longitude, address }
   * @param {File|null} photo - optional File object
   */
  create(fields, photo = null) {
    const fd = new FormData()
    fd.append('title',       fields.title)
    fd.append('description', fields.description)
    fd.append('latitude',    String(fields.latitude))
    fd.append('longitude',   String(fields.longitude))
    if (fields.address) fd.append('address', fields.address)
    if (photo)          fd.append('photo', photo)

    return client.post('/issues/', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  update: (id, data) => client.patch(`/issues/${id}`, data),
}
