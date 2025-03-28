import { HttpMethod, IVpcLink, ParameterMapping } from '../../../aws-apigatewayv2';
import { Duration } from '../../../core';

/**
 * Base options for private integration
 */
export interface HttpPrivateIntegrationOptions {
  /**
   * The vpc link to be used for the private integration
   *
   * @default - a new VpcLink is created
   */
  readonly vpcLink?: IVpcLink;

  /**
   * The HTTP method that must be used to invoke the underlying HTTP proxy.
   * @default HttpMethod.ANY
   */
  readonly method?: HttpMethod;

  /**
   * Specifies the server name to verified by HTTPS when calling the backend integration
   * @see https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-apigatewayv2-integration-tlsconfig.html
   * @default undefined private integration traffic will use HTTP protocol
   */

  readonly secureServerName?: string;

  /**
   * Specifies how to transform HTTP requests before sending them to the backend
   * @see https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-parameter-mapping.html
   * @default undefined requests are sent to the backend unmodified
   */
  readonly parameterMapping?: ParameterMapping;

  /**
   * The maximum amount of time an integration will run before it returns without a response.
   * Must be between 50 milliseconds and 29 seconds.
   * @default Duration.seconds(29)
   */
  readonly timeout?: Duration;
}
