import axios from 'axios'
import appConfig from '@/configs/app.config'

const ErpAxiosBase = axios.create({
    timeout: 60000,
    baseURL: `${appConfig.apiBaseUrl}/api/v1`,
    withCredentials: true,
})

export default ErpAxiosBase
