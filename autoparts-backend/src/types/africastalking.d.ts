declare module 'africastalking' {
  interface AfricasTalkingOptions {
    apiKey: string;
    username: string;
    url?: string;
  }

  interface SMS {
    send(opts: { to: string[]; message: string; from?: string }): Promise<any>;
  }

  interface AfricasTalkingClient {
    SMS: SMS;
  }

  function AfricasTalking(opts: AfricasTalkingOptions): AfricasTalkingClient;
  export default AfricasTalking;
}
