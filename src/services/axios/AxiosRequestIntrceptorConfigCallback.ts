import type { InternalAxiosRequestConfig } from 'axios'

const AxiosRequestIntrceptorConfigCallback = (
    config: InternalAxiosRequestConfig,
) => {
    /** handle config mutatation here before request to server */
    return config
}

export default AxiosRequestIntrceptorConfigCallback
